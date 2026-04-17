import {
  SqlOptimisationError,
  SqlParseError,
  optimiseSqlToCacheTree,
  type OptimizedSqlToCacheTreeResult,
} from '@pgmd/parsing'
import { useMemo, useState } from 'react'
import { appEnv } from './config/env'
import styles from './App.module.scss'

const starterSql = `select
  date_trunc('month', c.created_at) as month_bucket,
  u.plan_tier as plan_tier,
  count(distinct c.id) as chats_started,
  count(cm.id) as messages_sent,
  avg(cm.thread_depth) as avg_conversation_depth,
  max(cm.thread_depth) as max_conversation_depth
from chats c
join users u on u.id = c.user_id
left join chat_messages cm on cm.chat_id = c.id
where c.created_at >= now() - interval '1 year'
  and c.is_archived = false
  and coalesce(u.is_test_account, false) = false
group by 1, 2
order by 1, 2`

const toErrorMessage = (error: unknown): string => {
  if (error instanceof SqlParseError) {
    return error.position === null
      ? error.message
      : `${error.message} at position ${error.position}`
  }

  if (error instanceof SqlOptimisationError) {
    return error.message
  }

  if (error instanceof Error) {
    return error.message
  }

  return 'An unknown error occurred while optimising SQL.'
}

function App() {
  const [inputSql, setInputSql] = useState(starterSql)
  const [optimisedResult, setOptimisedResult] = useState<OptimizedSqlToCacheTreeResult | null>(null)
  const [optimiseError, setOptimiseError] = useState<string | null>(null)
  const [isOptimising, setIsOptimising] = useState(false)

  const cacheTreePreview = useMemo(() => {
    if (optimisedResult === null) {
      return ''
    }

    return JSON.stringify(optimisedResult.cacheTree, null, 2)
  }, [optimisedResult])

  const runOptimiser = async (): Promise<void> => {
    setIsOptimising(true)
    setOptimiseError(null)

    try {
      const nextResult = await optimiseSqlToCacheTree(inputSql)
      setOptimisedResult(nextResult)
    } catch (error) {
      setOptimisedResult(null)
      setOptimiseError(toErrorMessage(error))
    } finally {
      setIsOptimising(false)
    }
  }

  const isOptimiseDisabled = inputSql.trim().length === 0 || isOptimising

  return (
    <main className={styles['app']}>
      <section className={styles['panel']}>
        <h1 className={styles['title']}>{appEnv.VITE_APP_TITLE}</h1>
        <p className={styles['subtitle']}>
          Paste SQL, hit optimise, and review a cache-oriented CTE tree.
        </p>

        <label className={styles['fieldLabel']} htmlFor="sql-input">
          SQL Query
        </label>
        <textarea
          className={styles['sqlInput']}
          id="sql-input"
          onChange={(event) => setInputSql(event.currentTarget.value)}
          placeholder="select ..."
          rows={10}
          spellCheck={false}
          value={inputSql}
        />

        <div className={styles['actionsRow']}>
          <button
            className={styles['primaryButton']}
            disabled={isOptimiseDisabled}
            onClick={() => void runOptimiser()}
            type="button"
          >
            {isOptimising ? 'Optimising...' : 'Optimise'}
          </button>
        </div>

        {optimiseError !== null && <p className={styles['errorText']}>{optimiseError}</p>}

        {optimisedResult !== null && (
          <>
            <label className={styles['fieldLabel']} htmlFor="optimised-sql">
              Optimised Query
            </label>
            <textarea
              className={styles['sqlOutput']}
              id="optimised-sql"
              readOnly
              rows={12}
              spellCheck={false}
              value={optimisedResult.optimizedSql}
            />

            <label className={styles['fieldLabel']} htmlFor="cache-tree">
              Cache Tree
            </label>
            <textarea
              className={styles['treeOutput']}
              id="cache-tree"
              readOnly
              rows={12}
              spellCheck={false}
              value={cacheTreePreview}
            />

            {optimisedResult.warnings.length > 0 && (
              <section aria-label="optimizer warnings" className={styles['warningsPanel']}>
                <h2 className={styles['warningsTitle']}>Warnings</h2>
                <ul className={styles['warningsList']}>
                  {optimisedResult.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default App
