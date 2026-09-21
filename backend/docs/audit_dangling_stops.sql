-- READ ONLY. What the repair would touch, and the one thing that should give pause.
\pset border 2

\echo '== 1. non-terminal stops, by whether they were actually worked =='
SELECT ts.status AS stop_status,
       CASE WHEN btrim(COALESCE(ts.outcome,'')) <> ''
             OR EXISTS (SELECT 1 FROM task_execution te
                        WHERE te.uuid = ts.task_execution_uuid AND te.status='completed')
            THEN 'WORKED -> completed/skipped'
            ELSE 'never worked -> cancelled' END AS repair,
       count(*) AS stops
FROM trip_stop ts
WHERE ts.status IS NULL OR ts.status NOT IN ('completed','skipped','cancelled')
GROUP BY 1,2 ORDER BY 3 DESC;

\echo '== 2. the parent trips, and how stale they are =='
SELECT t.status AS trip_status,
       COALESCE(we.status,'(no workflow)') AS workflow_status,
       count(DISTINCT t.uuid) AS trips,
       min(COALESCE(t.start_time, t.created_at))::date AS oldest,
       max(COALESCE(t.start_time, t.created_at))::date AS newest
FROM trip t
LEFT JOIN workflow_execution we ON we.uuid = t.workflow_execution_uuid
WHERE t.status NOT IN ('completed','cancelled')
GROUP BY 1,2 ORDER BY 3 DESC;

\echo '== 3. THE RISK: anything that looks genuinely live (touched in the last 3 days) =='
SELECT t.uuid, t.status, COALESCE(t.start_time, t.created_at)::date AS started,
       count(ts.uuid) FILTER (WHERE ts.status NOT IN ('completed','skipped','cancelled')) AS open_stops,
       count(ts.uuid) FILTER (WHERE ts.status IN ('completed','skipped')) AS worked_stops
FROM trip t LEFT JOIN trip_stop ts ON ts.trip_uuid = t.uuid
WHERE t.status NOT IN ('completed','cancelled')
  AND COALESCE(t.start_time, t.created_at) > now() - interval '3 days'
GROUP BY 1,2,3 ORDER BY 3 DESC;

\echo '(if section 3 returns rows, STOP and tell me — those may be real trips in flight)'
