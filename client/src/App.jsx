import { useCallback, useEffect, useMemo, useState } from 'react'
import './App.css'

const api = async (path, options = {}) => {
  const { headers: extraHeaders, ...requestOptions } = options
  const response = await fetch(`/api${path}`, {
    ...requestOptions,
    credentials: 'same-origin',
    headers: {
      ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
      ...(requestOptions.method && requestOptions.method !== 'GET' ? { 'X-Requested-With': 'fetch' } : {}),
      ...extraHeaders,
    },
  })

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || 'Não foi possível concluir a solicitação.')
  return data
}

const formatDate = (value) =>
  new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

function App() {
  const [slots, setSlots] = useState([])
  const [operations, setOperations] = useState([])
  const [user, setUser] = useState(null)
  const [selected, setSelected] = useState([])
  const [authMode, setAuthMode] = useState('register')
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' })
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const [slotData, authData] = await Promise.all([api('/numbers'), api('/auth/me')])
    setSlots(slotData.numbers)
    setUser(authData.user)
    if (authData.user) {
      const operationData = await api('/operations')
      setOperations(operationData.operations)
    } else {
      setOperations([])
    }
    return { numbers: slotData.numbers }
  }, [])

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect
    refresh()
      .catch((reason) => setError(reason.message))
      .finally(() => setBusy(false))
  }, [refresh])

  const activeOperation = useMemo(
    () => operations.find((operation) => operation.status === 'PENDING'),
    [operations],
  )
  const selectedAvailable = useMemo(
    () => selected.filter((number) => slots.find((slot) => slot.number === number)?.status === 'FREE'),
    [selected, slots],
  )

  const toggleNumber = (number) => {
    if (slots.find((slot) => slot.number === number)?.status !== 'FREE') return
    setSelected((current) =>
      current.includes(number)
        ? current.filter((item) => item !== number)
        : [...current, number].sort((a, b) => a - b),
    )
    setError('')
  }

  const handleAuth = async (event) => {
    event.preventDefault()
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const data = await api(`/auth/${authMode}`, {
        method: 'POST',
        body: JSON.stringify(authForm),
      })
      setUser(data.user)
      setAuthForm({ name: '', email: '', password: '' })
      await refresh()
      setMessage(authMode === 'register' ? 'Conta criada. Você já está conectado.' : 'Sessão iniciada.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleLogout = async () => {
    setSubmitting(true)
    setError('')
    try {
      await api('/auth/logout', { method: 'POST' })
      setUser(null)
      setOperations([])
      setSelected([])
      setMessage('Você saiu da sua conta.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    setError('')
    setMessage('')
    try {
      const data = await refresh()
      const available = new Set(data.numbers.filter((slot) => slot.status === 'FREE').map((slot) => slot.number))
      const newlyUnavailable = selected.filter((number) => !available.has(number))
      setSelected((current) => current.filter((number) => available.has(number)))
      setMessage(newlyUnavailable.length
        ? `A posição ${newlyUnavailable.map(numberLabel).join(', ')} não está mais livre. A seleção foi atualizada.`
        : 'Posições atualizadas.')
    } catch (reason) {
      setError(reason.message)
    } finally {
      setRefreshing(false)
    }
  }

  const handleReserve = async () => {
    setError('')
    setMessage('')
    setSubmitting(true)
    try {
      const data = await api('/operations', {
        method: 'POST',
        body: JSON.stringify({ numbers: selectedAvailable }),
      })
      setSelected([])
      await refresh()
      setMessage(`Reserva criada. Ela expira em ${formatDate(data.operation.expiresAt)}.`)
    } catch (reason) {
      setError(reason.message)
      await refresh().catch((refreshError) => setError(`${reason.message} ${refreshError.message}`))
    } finally {
      setSubmitting(false)
    }
  }

  const numberLabel = (number) => String(number).padStart(2, '0')

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Voltar ao início">
          <span className="brand-mark" aria-hidden="true">p.</span>
          <span>posições</span>
        </a>
        <nav aria-label="Navegação principal">
          <a href="#como-funciona">Como funciona</a>
          <a href="#transparencia">Transparência</a>
          <a href="#contato">Contato</a>
        </nav>
        <a className="topbar-link" href={user ? '#minha-conta' : '#acessar'}>
          {user ? 'Minha conta' : 'Acessar'}
          <span aria-hidden="true">↗</span>
        </a>
      </header>

      <main id="inicio">
        <section className="hero-section">
          <div className="hero-copy">
            <span className="eyebrow"><span className="live-dot" /> POSIÇÕES ABERTAS</span>
            <h1>Um lugar para<br /><em>participar.</em></h1>
            <p>Escolha suas posições e acompanhe tudo com clareza. Sem surpresas, sem letras miúdas.</p>
            <a className="button button-dark" href="#numeros">Ver posições <span aria-hidden="true">↓</span></a>
            <div className="hero-note"><span aria-hidden="true">✳</span> Reservas temporárias, com prazo visível.</div>
          </div>
          <div className="hero-art" aria-label="Ilustração abstrata de posições numeradas">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="art-card art-card-back">28</div>
            <div className="art-card art-card-front"><span>POSIÇÃO</span><strong>07</strong><i>disponível</i></div>
            <div className="art-spark spark-one">✳</div>
            <div className="art-spark spark-two">✳</div>
            <div className="art-caption">ESCOLHA COM<br />TRANQUILIDADE</div>
          </div>
          <div className="hero-index"><span>01 / 04</span><span className="index-line" /><span>ESCOLHA</span></div>
        </section>

        <section className="selection-section" id="numeros">
          <div className="section-heading">
            <div>
              <span className="eyebrow">01 — SELECIONE</span>
              <h2>Escolha suas posições</h2>
              <p>Toque em uma ou mais posições livres. A seleção só fica reservada após confirmar.</p>
            </div>
            <div className="section-tools">
              <button className="text-button refresh-button" type="button" onClick={handleRefresh} disabled={busy || refreshing}>{refreshing ? 'Atualizando…' : 'Atualizar ↻'}</button>
              <div className="availability"><span className="live-dot" /> {slots.filter((slot) => slot.status === 'FREE').length} livres</div>
            </div>
          </div>

          <div className="legend" aria-label="Legenda dos estados">
            <span><i className="legend-dot free" /> Livre</span>
            <span><i className="legend-dot chosen" /> Selecionado</span>
            <span><i className="legend-dot reserved" /> Reservado</span>
            <span><i className="legend-dot confirmed" /> Confirmado</span>
          </div>

          {error && <div className="notice notice-error" role="alert">{error}</div>}
          {message && <div className="notice notice-success" role="status">{message}</div>}

          {busy ? (
            <div className="loading" role="status">Carregando posições…</div>
          ) : slots.length === 100 ? (
            <div className="number-grid" aria-label="Grade de 100 posições">
              {slots.map((slot) => {
                const isSelected = selected.includes(slot.number)
                const status = isSelected ? 'SELECTED' : slot.status
                return (
                  <button
                    className={`number-cell state-${status.toLowerCase()}`}
                    type="button"
                    key={slot.number}
                    disabled={slot.status !== 'FREE'}
                    aria-pressed={isSelected}
                    aria-label={`Posição ${numberLabel(slot.number)}: ${status === 'FREE' ? 'livre' : status === 'SELECTED' ? 'selecionada' : slot.status === 'CONFIRMED' ? 'confirmada' : 'reservada'}`}
                    onClick={() => toggleNumber(slot.number)}
                  >
                    {numberLabel(slot.number)}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="notice notice-error" role="alert">A grade retornada pelo servidor não tem 100 posições. Tente novamente mais tarde.</div>
          )}

          <div className="selection-summary">
            <div>
              <span className="summary-label">SUA SELEÇÃO</span>
              <strong>{selected.length.toString().padStart(2, '0')} <span>posição{selected.length === 1 ? '' : 'ões'}</span></strong>
              <p>{selected.length ? selected.map(numberLabel).join(' · ') : 'Nenhuma posição selecionada'}</p>
            </div>
            <div className="summary-actions">
              <button className="text-button" type="button" onClick={() => setSelected([])} disabled={!selected.length}>Limpar seleção</button>
              <button
                className="button button-primary"
                type="button"
                onClick={handleReserve}
                disabled={!user || !selectedAvailable.length || submitting || Boolean(activeOperation)}
                title={!user ? 'Entre na sua conta para reservar' : activeOperation ? 'Você já tem uma reserva ativa' : undefined}
              >
                {submitting ? 'Aguarde…' : 'Reservar posição'} <span aria-hidden="true">↗</span>
              </button>
            </div>
          </div>
          {!user && <p className="inline-hint">Para reservar, entre ou crie uma conta abaixo. Selecionar posições não as reserva.</p>}
          {activeOperation && (
            <div className="active-reservation">
              <div><span className="summary-label">SUA RESERVA ATIVA</span><p>Posições {activeOperation.numbers.map(numberLabel).join(', ')} · expira em {formatDate(activeOperation.expiresAt)}</p></div>
              <span className="status-pill">Pendente</span>
            </div>
          )}
        </section>

        <section className="how-section" id="como-funciona">
          <div className="how-intro">
            <span className="eyebrow">02 — SIMPLES ASSIM</span>
            <h2>Você escolhe.<br /><em>Você acompanha.</em></h2>
          </div>
          <div className="steps">
            <article><span className="step-number">01</span><h3>Escolha</h3><p>Selecione as posições livres que fazem sentido para você.</p></article>
            <article><span className="step-number">02</span><h3>Reserve</h3><p>Entre na sua conta e confirme. A reserva tem prazo informado.</p></article>
            <article><span className="step-number">03</span><h3>Acompanhe</h3><p>Consulte o estado e o histórico das suas operações na sua conta.</p></article>
          </div>
        </section>

        <section className="account-section" id="acessar">
          <div className="account-copy">
            <span className="eyebrow">03 — SUA CONTA</span>
            <h2>{user ? `Olá, ${user.name.split(' ')[0]}.` : 'Tudo no seu nome.'}</h2>
            <p>{user ? 'Suas operações aparecem somente para você.' : 'Crie uma conta para fazer reservas e consultar seu histórico.'}</p>
            {user && (
              <div className="account-details" id="minha-conta">
                <span>{user.email}</span>
                <button className="text-button" type="button" onClick={handleLogout} disabled={submitting}>Sair da conta</button>
                {operations.length > 0 && (
                  <div className="account-history">
                    <span>{operations.length} operação{operations.length === 1 ? '' : 'ões'} no histórico</span>
                    {operations.slice(0, 5).map((operation) => (
                      <div className="history-row" key={operation.id}>
                        <span>{operation.numbers.map(numberLabel).join(', ')}</span>
                        <span className={`history-status status-${operation.status.toLowerCase()}`}>{operation.status === 'PENDING' ? 'Reserva ativa' : operation.status === 'EXPIRED' ? 'Expirada' : operation.status === 'CONFIRMED' ? 'Confirmada' : 'Cancelada'}</span>
                        <time dateTime={operation.createdAt}>{formatDate(operation.createdAt)}</time>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          {!user && (
            <div className="auth-card">
              <div className="auth-tabs" role="tablist" aria-label="Acesso à conta">
                <button type="button" role="tab" aria-selected={authMode === 'register'} className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')}>Criar conta</button>
                <button type="button" role="tab" aria-selected={authMode === 'login'} className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>Entrar</button>
              </div>
              <form onSubmit={handleAuth}>
                {authMode === 'register' && (
                  <label>Nome completo<input autoComplete="name" minLength="2" maxLength="80" required value={authForm.name} onChange={(event) => setAuthForm({ ...authForm, name: event.target.value })} /></label>
                )}
                <label>E-mail<input type="email" autoComplete="email" maxLength="254" required value={authForm.email} onChange={(event) => setAuthForm({ ...authForm, email: event.target.value })} /></label>
                <label>Senha<input type="password" autoComplete={authMode === 'register' ? 'new-password' : 'current-password'} minLength={authMode === 'register' ? 12 : 1} maxLength="72" required value={authForm.password} onChange={(event) => setAuthForm({ ...authForm, password: event.target.value })} /></label>
                {authMode === 'register' && <small>Use ao menos 12 caracteres. Não reutilize uma senha importante.</small>}
                <button className="button button-dark auth-submit" type="submit" disabled={submitting}>{submitting ? 'Aguarde…' : authMode === 'register' ? 'Criar conta' : 'Entrar'} <span aria-hidden="true">↗</span></button>
              </form>
            </div>
          )}
        </section>

        <section className="transparency-section" id="transparencia">
          <div className="transparency-mark" aria-hidden="true">i</div>
          <div><span className="eyebrow">CLAREZA EM PRIMEIRO LUGAR</span><h2>Uma plataforma de posições, não de promessas.</h2><p>Esta versão não processa pagamentos, não vende chances e não realiza sorteios ou distribuição aleatória de prêmios. Nenhuma reserva é uma promessa de retorno financeiro. A finalidade e as condições da operação precisam ser informadas pelo responsável antes do lançamento.</p></div>
          <span className="contact-placeholder" id="contato">Contato do responsável a configurar</span>
        </section>
      </main>

      <footer className="footer">
        <a className="brand" href="#inicio"><span className="brand-mark" aria-hidden="true">p.</span><span>posições</span></a>
        <span>© {CURRENT_YEAR} · Plataforma em configuração</span>
        <div><a href="#transparencia">Transparência</a><a href="#como-funciona">Como funciona</a></div>
      </footer>
    </div>
  )
}

const CURRENT_YEAR = new Date().getFullYear()

export default App
