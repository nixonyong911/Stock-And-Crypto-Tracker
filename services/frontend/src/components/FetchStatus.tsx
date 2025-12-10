import { createServerSupabaseClient } from '@/lib/supabase/server';
import { FetchLog } from '@/types';
import styles from './FetchStatus.module.css';

async function getRecentFetchLogs(): Promise<FetchLog[]> {
  try {
    const supabase = createServerSupabaseClient();
    
    // Query fetch_logs with a join to data_sources for the source name
    const { data, error } = await supabase
      .from('fetch_logs')
      .select(`
        id,
        fetch_type,
        status,
        records_fetched,
        error_message,
        started_at,
        completed_at,
        data_sources!inner (
          name
        )
      `)
      .order('started_at', { ascending: false })
      .limit(10);
    
    if (error) {
      console.error('Error fetching fetch logs:', error);
      return [];
    }
    
    // Transform the data to match FetchLog interface
    return (data || []).map((log: any) => ({
      id: log.id,
      source: log.data_sources?.name || 'Unknown',
      fetch_type: log.fetch_type,
      status: log.status,
      records_fetched: log.records_fetched,
      error_message: log.error_message,
      started_at: log.started_at,
      completed_at: log.completed_at,
    }));
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
