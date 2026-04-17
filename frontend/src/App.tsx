import { useAtomValue, useSetAtom } from 'jotai'
import { appEnv } from './config/env'
import { counterAtom, incrementCounterAtom } from './state/counterAtoms'
import styles from './App.module.scss'

function App() {
  const counterValue = useAtomValue(counterAtom)
  const incrementCounter = useSetAtom(incrementCounterAtom)

  return (
    <main className={styles['app']}>
      <section className={styles['panel']}>
        <h1 className={styles['title']}>{appEnv.VITE_APP_TITLE}</h1>
        <p className={styles['subtitle']}>
          Frontend scaffold is wired with strict linting, testing, SCSS, Jotai, Zod, and Playwright.
        </p>
        <div className={styles['counterRow']}>
          <button
            className={styles['primaryButton']}
            onClick={() => incrementCounter()}
            type="button"
          >
            Increment
          </button>
          <p className={styles['counterValue']}>Count: {counterValue}</p>
        </div>
      </section>
    </main>
  )
}

export default App
