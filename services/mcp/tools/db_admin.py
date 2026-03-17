"""Database administration tools for direct PostgreSQL access (dev tier only)."""

import asyncio
import json
from typing import Optional

import asyncpg


DB_ADMIN_TIMEOUT = 30.0

_SCHEMA_MIGRATIONS_DDL = """
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    query TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"""


async def execute_sql(conn: asyncpg.Connection, query: str) -> str:
    """Execute arbitrary SQL against the database."""
    timeout_ms = int(DB_ADMIN_TIMEOUT * 1000)
    try:
        await conn.execute(f"SET LOCAL statement_timeout = '{timeout_ms}'")

        stripped = query.strip().rstrip(";").strip()
        first_word = stripped.split()[0].upper() if stripped else ""

        if first_word in ("SELECT", "WITH", "EXPLAIN", "SHOW", "TABLE"):
            rows = await conn.fetch(query)
            if not rows:
                return json.dumps({"rows": [], "row_count": 0})
            results = [dict(r) for r in rows]
            return json.dumps(
                {"rows": results, "row_count": len(results)},
                default=str,
            )

        result = await conn.execute(query)
        return json.dumps({"status": result, "message": "Query executed successfully"})

    except asyncpg.QueryCanceledError as e:
        raise asyncio.TimeoutError(f"Query timed out after {DB_ADMIN_TIMEOUT}s") from e
    except asyncpg.PostgresError as e:
        return json.dumps({"error": str(e), "error_type": type(e).__name__})


async def list_tables(
    conn: asyncpg.Connection,
    schemas: Optional[list[str]] = None,
    verbose: bool = False,
) -> str:
    """List database tables with optional column details."""
    schemas = schemas or ["public"]
    placeholders = ", ".join(f"${i+1}" for i in range(len(schemas)))

    tables_query = f"""
        SELECT table_schema, table_name,
               pg_stat_get_live_tuples(c.oid) AS row_estimate
        FROM information_schema.tables t
        JOIN pg_class c ON c.relname = t.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
        WHERE t.table_schema IN ({placeholders})
          AND t.table_type = 'BASE TABLE'
        ORDER BY t.table_schema, t.table_name
    """

    try:
        tables = await conn.fetch(tables_query, *schemas)

        if not verbose:
            results = [
                {
                    "schema": r["table_schema"],
                    "table": r["table_name"],
                    "row_estimate": int(r["row_estimate"]) if r["row_estimate"] else 0,
                }
                for r in tables
            ]
            return json.dumps({"tables": results, "count": len(results)}, default=str)

        columns_query = f"""
            SELECT c.table_schema, c.table_name, c.column_name, c.data_type,
                   c.is_nullable, c.column_default, c.ordinal_position
            FROM information_schema.columns c
            WHERE c.table_schema IN ({placeholders})
            ORDER BY c.table_schema, c.table_name, c.ordinal_position
        """
        pk_query = f"""
            SELECT tc.table_schema, tc.table_name,
                   kcu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            WHERE tc.constraint_type = 'PRIMARY KEY'
              AND tc.table_schema IN ({placeholders})
        """
        fk_query = f"""
            SELECT tc.table_schema, tc.table_name,
                   kcu.column_name,
                   ccu.table_schema AS foreign_schema,
                   ccu.table_name AS foreign_table,
                   ccu.column_name AS foreign_column
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu
              ON tc.constraint_name = kcu.constraint_name
              AND tc.table_schema = kcu.table_schema
            JOIN information_schema.constraint_column_usage ccu
              ON ccu.constraint_name = tc.constraint_name
              AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND tc.table_schema IN ({placeholders})
        """

        columns, pks, fks = await asyncio.gather(
            conn.fetch(columns_query, *schemas),
            conn.fetch(pk_query, *schemas),
            conn.fetch(fk_query, *schemas),
        )

        pk_map: dict[str, set[str]] = {}
        for r in pks:
            key = f"{r['table_schema']}.{r['table_name']}"
            pk_map.setdefault(key, set()).add(r["column_name"])

        fk_map: dict[str, list[dict]] = {}
        for r in fks:
            key = f"{r['table_schema']}.{r['table_name']}"
            fk_map.setdefault(key, []).append({
                "column": r["column_name"],
                "references": f"{r['foreign_schema']}.{r['foreign_table']}.{r['foreign_column']}",
            })

        col_map: dict[str, list[dict]] = {}
        for r in columns:
            key = f"{r['table_schema']}.{r['table_name']}"
            col_map.setdefault(key, []).append({
                "name": r["column_name"],
                "type": r["data_type"],
                "nullable": r["is_nullable"] == "YES",
                "default": r["column_default"],
            })

        results = []
        for r in tables:
            key = f"{r['table_schema']}.{r['table_name']}"
            results.append({
                "schema": r["table_schema"],
                "table": r["table_name"],
                "row_estimate": int(r["row_estimate"]) if r["row_estimate"] else 0,
                "columns": col_map.get(key, []),
                "primary_keys": sorted(pk_map.get(key, set())),
                "foreign_keys": fk_map.get(key, []),
            })

        return json.dumps({"tables": results, "count": len(results)}, default=str)

    except asyncpg.PostgresError as e:
        return json.dumps({"error": str(e), "error_type": type(e).__name__})


async def list_extensions(conn: asyncpg.Connection) -> str:
    """List installed PostgreSQL extensions."""
    query = """
        SELECT e.extname AS name,
               e.extversion AS installed_version,
               n.nspname AS schema,
               c.description AS comment
        FROM pg_extension e
        JOIN pg_namespace n ON n.oid = e.extnamespace
        LEFT JOIN pg_description c ON c.objoid = e.oid AND c.classoid = 'pg_extension'::regclass
        ORDER BY e.extname
    """
    try:
        rows = await conn.fetch(query)
        results = [
            {
                "name": r["name"],
                "version": r["installed_version"],
                "schema": r["schema"],
                "comment": r["comment"],
            }
            for r in rows
        ]
        return json.dumps({"extensions": results, "count": len(results)}, default=str)
    except asyncpg.PostgresError as e:
        return json.dumps({"error": str(e), "error_type": type(e).__name__})


async def apply_migration(
    conn: asyncpg.Connection, name: str, query: str
) -> str:
    """Apply a named SQL migration inside a transaction and record it."""
    try:
        async with conn.transaction():
            await conn.execute(_SCHEMA_MIGRATIONS_DDL)

            existing = await conn.fetchval(
                "SELECT applied_at FROM schema_migrations WHERE name = $1", name
            )
            if existing:
                return json.dumps({
                    "error": f"Migration '{name}' already applied at {existing}",
                    "status": "skipped",
                })

            await conn.execute(query)
            await conn.execute(
                "INSERT INTO schema_migrations (name, query) VALUES ($1, $2)",
                name, query,
            )

        return json.dumps({
            "status": "applied",
            "migration": name,
            "message": f"Migration '{name}' applied successfully",
        })

    except asyncpg.PostgresError as e:
        return json.dumps({"error": str(e), "error_type": type(e).__name__})


async def list_migrations(conn: asyncpg.Connection) -> str:
    """List all applied schema migrations."""
    try:
        exists = await conn.fetchval(
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'schema_migrations')"
        )
        if not exists:
            return json.dumps({"migrations": [], "count": 0, "message": "No migrations table found"})

        rows = await conn.fetch(
            "SELECT id, name, applied_at FROM schema_migrations ORDER BY applied_at"
        )
        results = [
            {"id": r["id"], "name": r["name"], "applied_at": str(r["applied_at"])}
            for r in rows
        ]
        return json.dumps({"migrations": results, "count": len(results)}, default=str)

    except asyncpg.PostgresError as e:
        return json.dumps({"error": str(e), "error_type": type(e).__name__})
