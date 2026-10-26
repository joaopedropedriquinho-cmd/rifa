import 'dotenv/config'
import bcrypt from 'bcryptjs'
import connectPgSimple from 'connect-pg-simple'
import express from 'express'
import { rateLimit } from 'express-rate-limit'
import session from 'express-session'
import helmet from 'helmet'
import { Pool } from 'pg'
import { z } from 'zod'
import { PrismaPg } from '@prisma/adapter-pg'
import { Prisma, PrismaClient } from '../prisma/generated/prisma/client.ts'
import { getReservationExpiry, parseReservationMinutes, validateNumbers } from './domain.js'

const port = Number(process.env.PORT || 3000)
const nodeEnv = process.env.NODE_ENV || 'development'
const databaseUrl = process.env.DATABASE_URL
const sessionSecret = process.env.SESSION_SECRET
const appOrigin = process.env.APP_ORIGIN
const reservationMinutes = parseReservationMinutes(process.env.RESERVATION_TTL_MINUTES)

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port.')
if (!databaseUrl) throw new Error('DATABASE_URL is required.')
if (!sessionSecret || sessionSecret.length < 32) throw new Error('SESSION_SECRET must contain at least 32 characters.')
if (!appOrigin) throw new Error('APP_ORIGIN is required.')

const parsedOrigin = new URL(appOrigin)
if (nodeEnv === 'production' && parsedOrigin.protocol !== 'https:') {
  throw new Error('APP_ORIGIN must use HTTPS in production.')
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 10 }),
})
const pool = new Pool({ connectionString: databaseUrl })
const PgSessionStore = connectPgSimple(session)
const app = express()
const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next)

app.disable('x-powered-by')
app.set('trust proxy', nodeEnv === 'production' ? 1 : false)
app.use(helmet())
app.use(express.json({ limit: '16kb', strict: true }))
app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 180,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}))
app.use(session({
  name: 'rifalivre.sid',
  secret: sessionSecret,
  store: new PgSessionStore({ pool, createTableIfMissing: true }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: nodeEnv === 'production',
    maxAge: 10 * 24 * 60 * 60 * 1000,
  },
}))

app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (req.get('origin') !== parsedOrigin.origin || req.get('x-requested-with') !== 'fetch') {
      return res.status(403).json({ error: 'Origem da solicitação não autorizada.' })
    }
  }
  next()
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.' },
})

const registrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(72),
})
const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(72),
})
const operationSchema = z.object({
  numbers: z.array(z.number().int().min(1).max(100)).min(1).max(100),
})

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email }
}

function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Entre na sua conta para continuar.' })
  next()
}

function validateBody(schema, body) {
  const parsed = schema.safeParse(body)
  return parsed.success ? parsed.data : null
}

async function expireReservations() {
  const now = new Date()
  const expired = await prisma.operation.findMany({
    where: { status: 'PENDING', expiresAt: { lte: now } },
    select: { id: true, userId: true },
  })
  if (!expired.length) return

  for (const { id, userId } of expired) {
    await prisma.$transaction(async (transaction) => {
      const updated = await transaction.operation.updateMany({
        where: { id, status: 'PENDING', expiresAt: { lte: now } },
        data: { status: 'EXPIRED' },
      })
      if (!updated.count) return

      await transaction.numberSlot.updateMany({
        where: { operationId: id, status: 'RESERVED' },
        data: { status: 'FREE', operationId: null, reservationExpiresAt: null },
      })
      await transaction.auditLog.create({
        data: {
          userId,
          operationId: id,
          action: 'RESERVATION_EXPIRED',
          outcome: 'SUCCESS',
          details: { source: 'server-expiry-cleanup' },
        },
      })
    })
  }
}

app.get('/api/health', asyncRoute(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`
  res.json({ status: 'ok' })
}))

app.get('/api/numbers', asyncRoute(async (_req, res) => {
  await expireReservations()
  const numbers = await prisma.numberSlot.findMany({
    orderBy: { number: 'asc' },
    select: { number: true, status: true, reservationExpiresAt: true },
  })
  res.json({ numbers })
}))

app.get('/api/auth/me', asyncRoute(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null })
  const user = await prisma.user.findUnique({
    where: { id: req.session.userId },
    select: { id: true, name: true, email: true },
  })
  if (!user) {
    await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()))
    res.clearCookie('rifalivre.sid')
    return res.json({ user: null })
  }
  res.json({ user })
}))

app.post('/api/auth/register', authLimiter, asyncRoute(async (req, res) => {
  const input = validateBody(registrationSchema, req.body)
  if (!input) return res.status(400).json({ error: 'Confira o nome, o e-mail e a senha informados.' })

  let user
  try {
    user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email.toLowerCase(),
        passwordHash: await bcrypt.hash(input.password, 12),
      },
      select: { id: true, name: true, email: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return res.status(409).json({ error: 'Não foi possível criar a conta com esses dados.' })
    }
    throw error
  }

  await prisma.auditLog.create({
    data: { userId: user.id, action: 'USER_REGISTERED', outcome: 'SUCCESS' },
  })
  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()))
  req.session.userId = user.id
  res.status(201).json({ user: publicUser(user) })
}))

app.post('/api/auth/login', authLimiter, asyncRoute(async (req, res) => {
  const input = validateBody(loginSchema, req.body)
  if (!input) return res.status(400).json({ error: 'Confira o e-mail e a senha informados.' })

  const user = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
    select: { id: true, name: true, email: true, passwordHash: true },
  })
  const passwordMatches = user && await bcrypt.compare(input.password, user.passwordHash)
  if (!passwordMatches) return res.status(401).json({ error: 'E-mail ou senha incorretos.' })

  await new Promise((resolve, reject) => req.session.regenerate((error) => error ? reject(error) : resolve()))
  req.session.userId = user.id
  res.json({ user: publicUser(user) })
}))

app.post('/api/auth/logout', requireUser, asyncRoute(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy((error) => error ? reject(error) : resolve()))
  res.clearCookie('rifalivre.sid', {
    httpOnly: true,
    sameSite: 'strict',
    secure: nodeEnv === 'production',
  })
  res.status(204).end()
}))

app.get('/api/operations', requireUser, asyncRoute(async (req, res) => {
  await expireReservations()
  const operations = await prisma.operation.findMany({
    where: { userId: req.session.userId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      status: true,
      expiresAt: true,
      createdAt: true,
      numbers: { select: { number: true }, orderBy: { number: 'asc' } },
    },
  })
  res.json({
    operations: operations.map((operation) => ({
      ...operation,
      numbers: operation.numbers.map(({ number }) => number),
    })),
  })
}))

app.post('/api/operations', requireUser, asyncRoute(async (req, res) => {
  const input = validateBody(operationSchema, req.body)
  const numbers = input && validateNumbers(input.numbers)
  if (!numbers) return res.status(400).json({ error: 'Selecione posições válidas e sem repetição.' })

  await expireReservations()
  const expiresAt = getReservationExpiry(reservationMinutes)
  let operation

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      operation = await prisma.$transaction(async (transaction) => {
        const created = await transaction.operation.create({
          data: {
            userId: req.session.userId,
            expiresAt,
            numbers: { create: numbers.map((number) => ({ slot: { connect: { number } } })) },
          },
        })
        const update = await transaction.numberSlot.updateMany({
          where: { number: { in: numbers }, status: 'FREE' },
          data: {
            status: 'RESERVED',
            operationId: created.id,
            reservationExpiresAt: expiresAt,
          },
        })
        if (update.count !== numbers.length) {
          const error = new Error('Uma ou mais posições foram reservadas por outra pessoa. A grade foi atualizada.')
          error.code = 'SLOT_CONFLICT'
          throw error
        }
        await transaction.auditLog.create({
          data: {
            userId: req.session.userId,
            operationId: created.id,
            action: 'POSITIONS_RESERVED',
            outcome: 'SUCCESS',
            details: { numbers, expiresAt: expiresAt.toISOString() },
          },
        })
        return created
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
      break
    } catch (error) {
      if (error.code === 'SLOT_CONFLICT') return res.status(409).json({ error: error.message })
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034' && attempt < 2) continue
      throw error
    }
  }

  if (!operation) throw new Error('A reserva não pôde ser concluída após tentativas de concorrência.')
  res.status(201).json({
    operation: {
      id: operation.id,
      status: operation.status,
      expiresAt: operation.expiresAt,
      numbers,
    },
  })
}))

app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada.' }))

app.use((error, _req, res, _next) => {
  if (res.headersSent) return
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ error: 'O corpo da solicitação não contém JSON válido.' })
  }
  console.error('API request failed:', error?.name || 'UnknownError')
  res.status(500).json({ error: 'Ocorreu um erro interno. Tente novamente mais tarde.' })
})

const server = app.listen(port, '0.0.0.0', () => {
  console.info(`API listening on port ${port}`)
})
const expiryScheduler = setInterval(() => {
  expireReservations().catch((error) => {
    console.error('Reservation expiry cleanup failed:', error?.name || 'UnknownError')
  })
}, 60_000)
expiryScheduler.unref()

let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) return
  shuttingDown = true
  console.info(`Received ${signal}; shutting down.`)
  clearInterval(expiryScheduler)
  server.close(async (error) => {
    try {
      await prisma.$disconnect()
      await pool.end()
      if (error) {
        console.error('HTTP server shutdown failed:', error.name)
        process.exitCode = 1
      }
    } catch (shutdownError) {
      console.error('Database shutdown failed:', shutdownError.name)
      process.exitCode = 1
    }
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
