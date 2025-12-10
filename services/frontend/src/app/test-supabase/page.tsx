import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export default async function TestSupabasePage() {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  
  // Query the test table
  const { data, error } = await supabase
    .from('test')
    .select('*')
    .order('created_at', { ascending: false })
  
  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Supabase Connection Test</h1>
      
      <section style={{ marginTop: '2rem' }}>
        <h2>Connection Status</h2>
        {error ? (
          <div style={{ color: 'red', padding: '1rem', background: '#fee', borderRadius: '8px' }}>
            <strong>Error:</strong> {error.message}
            <pre style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>
              {JSON.stringify(error, null, 2)}
            </pre>
          </div>
        ) : (
          <div style={{ color: 'green', padding: '1rem', background: '#efe', borderRadius: '8px' }}>
            <strong>✓ Connected successfully!</strong>
          </div>
        )}
      </section>
      
      <section style={{ marginTop: '2rem' }}>
        <h2>Test Table Data</h2>
        {data && data.length > 0 ? (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr style={{ background: '#f0f0f0' }}>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left' }}>ID</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left' }}>Message</th>
                <th style={{ padding: '0.5rem', border: '1px solid #ddd', textAlign: 'left' }}>Created At</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id}>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd', fontSize: '0.8rem' }}>
                    {row.id}
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>
                    {row.message}
                  </td>
                  <td style={{ padding: '0.5rem', border: '1px solid #ddd' }}>
                    {new Date(row.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p style={{ color: '#666' }}>
            No data found. Make sure you created the test table and inserted sample data.
          </p>
        )}
      </section>
      
      <section style={{ marginTop: '2rem', padding: '1rem', background: '#f9f9f9', borderRadius: '8px' }}>
        <h3>Setup Instructions</h3>
        <p>Run this SQL in your Supabase SQL Editor:</p>
        <pre style={{ background: '#1e1e1e', color: '#d4d4d4', padding: '1rem', borderRadius: '4px', overflow: 'auto' }}>
{`-- Create test table
CREATE TABLE test (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and add policies
ALTER TABLE test ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON test FOR SELECT USING (true);
CREATE POLICY "Allow authenticated insert" ON test FOR INSERT WITH CHECK (true);

-- Insert sample data
INSERT INTO test (message) VALUES ('Hello from Supabase!');`}
        </pre>
      </section>
    </div>
  )
}

