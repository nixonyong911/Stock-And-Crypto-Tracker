import { query } from '@/lib/db';
import { FetchLog } from '@/types';
import styles from './FetchStatus.module.css';

async function getRecentFetchLogs(): Promise<FetchLog[]> {
  try {
    const logs = await query<FetchLog>(`
      SELECT 
        fl.id,
        ds.name AS source,
        fl.fetch_type,
        fl.status,
        fl.records_fetched,
        fl.error_message,
        fl.started_at,
        fl.completed_at
      FROM fetch_logs fl
      JOIN data_sources ds ON fl.data_source_id = ds.id
      ORDER BY fl.started_at DESC
      LIMIT 10
    `);
    return logs;
  } catch (error) {
    console.error('Error fetching fetch logs:', error);
    return [];
  }
}

function formatDateTime(date: Date | null): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getDuration(start: Date, end: Date | null): string {
  if (!end) return 'In progress...';
  const ms = new Date(end).getTime() - new Date(start).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return styles.statusCompleted;
    case 'failed':
      return styles.statusFailed;
    case 'started':
      return styles.statusStarted;
    default:
      return '';
  }
}

export async function FetchStatus() {
  const logs = await getRecentFetchLogs();

  if (logs.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No fetch operations recorded yet.</p>
        <p className={styles.hint}>Status will appear when data fetchers run.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Status</th>
              <th className={styles.numeric}>Records</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td className={styles.source}>{log.source}</td>
                <td className={styles.type}>{log.fetch_type}</td>
                <td>
                  <span className={`${styles.status} ${getStatusClass(log.status)}`}>
                    {log.status}
                  </span>
                </td>
                <td className={styles.numeric}>{log.records_fetched}</td>
                <td className={styles.datetime}>{formatDateTime(log.started_at)}</td>
                <td className={styles.duration}>{getDuration(log.started_at, log.completed_at)}</td>
                <td className={styles.error}>
                  {log.error_message ? (
                    <span title={log.error_message}>
                      {log.error_message.slice(0, 30)}...
                    </span>
                  ) : (
                    '-'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

