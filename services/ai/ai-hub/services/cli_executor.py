"""
CLI Executor Service

Executes AI CLI tools (claude, cursor-agent) using a prefix pattern:
- Production (prefix empty): Direct execution on host
- Local dev (prefix = SSH cmd): Execute via SSH to VM

The prefix is configured via AI_HUB_CLI_PREFIX environment variable.
"""

import asyncio
import shlex
from dataclasses import dataclass
from typing import Optional
from asyncio.subprocess import PIPE

from config import get_config


@dataclass
class CLIResult:
    """Result from CLI execution."""
    success: bool
    output: str
    error: Optional[str] = None
    exit_code: int = 0
    execution_time_ms: int = 0


class CLIExecutor:
    """
    Executes AI CLI commands using prefix pattern.
    
    The AI_HUB_CLI_PREFIX determines how commands are executed:
    - Empty (production): Commands run directly on host
    - SSH command (local): Commands run via SSH to VM
    
    Example:
        prefix = "ssh -i key.pem user@host"
        command = 'cd /home/azureuser/stock-tracker && echo "hello" | cursor-agent --print'
        
        Final: ssh -i key.pem user@host 'cd /home/azureuser/stock-tracker && echo "hello" | cursor-agent --print'
    """
    
    def __init__(self):
        self.config = get_config()
        self.settings = self.config.settings
        self.cli_prefix = self.settings.ai_hub_cli_prefix.strip()
        self.default_context_path = self.settings.ai_hub_default_context_path
        self.timeout = self.settings.ai_hub_cli_timeout_seconds
    
    async def execute(
        self,
        cli: str,
        message: str,
        context_path: Optional[str] = None,
        model: Optional[str] = None,
        output_format: str = "text"
    ) -> CLIResult:
        """
        Execute a CLI command.
        
        Args:
            cli: CLI to use ('claude' or 'cursor-agent')
            message: The prompt/message to send
            context_path: Override context path (default: /home/azureuser/stock-tracker)
            model: Model variant to use (e.g., 'opus-4.5', 'sonnet-4')
            output_format: Output format ('text' or 'json')
        
        Returns:
            CLIResult with output or error
        """
        import time
        start_time = time.time()
        
        path = context_path or self.default_context_path
        
        # Build the CLI command
        cli_command = self._build_cli_command(cli, message, output_format, model)
        
        # Build full command with context path
        command = f'cd "{path}" && {cli_command}'
        
        # Apply prefix if configured (for SSH in local dev)
        if self.cli_prefix:
            # Escape the command for SSH
            escaped_command = shlex.quote(command)
            full_command = f'{self.cli_prefix} {escaped_command}'
        else:
            full_command = command
        
        try:
            result = await self._execute_command(full_command)
            result.execution_time_ms = int((time.time() - start_time) * 1000)
            return result
            
        except asyncio.TimeoutError:
            return CLIResult(
                success=False,
                output="",
                error=f"CLI execution timed out after {self.timeout} seconds",
                exit_code=-1,
                execution_time_ms=int((time.time() - start_time) * 1000)
            )
        except Exception as e:
            return CLIResult(
                success=False,
                output="",
                error=str(e),
                exit_code=-1,
                execution_time_ms=int((time.time() - start_time) * 1000)
            )
    
    def _build_cli_command(
        self, 
        cli: str, 
        message: str, 
        output_format: str,
        model: Optional[str] = None
    ) -> str:
        """
        Build the CLI command string with piped input for non-interactive mode.
        
        Both claude and cursor-agent use --print flag for headless/script mode,
        with the prompt piped via stdin (not as positional argument).
        
        cursor-agent flags:
        - --print: non-interactive mode (required for scripts)
        - --approve-mcps: auto-approve MCP servers in headless mode
        - --force: allow tool execution without explicit confirmation
        """
        # Escape for shell: backslash, double quotes, and dollar signs
        escaped_message = message.replace('\\', '\\\\').replace('"', '\\"').replace('$', '\\$')
        
        if cli == "claude":
            # Claude Code CLI: pipe message to stdin with --print for non-interactive
            return f'echo "{escaped_message}" | claude --print --output-format {output_format}'
        elif cli == "cursor-agent":
            # cursor-agent: use -p flag for prompt (cleaner than echo pipe)
            model_flag = f"--model {model}" if model else ""
            return f'cursor-agent -p "{escaped_message}" {model_flag} --approve-mcps --force'
        else:
            raise ValueError(f"Unknown CLI: {cli}. Supported: claude, cursor-agent")
    
    async def _execute_command(self, command: str) -> CLIResult:
        """Execute a shell command.
        
        Uses start_new_session=True to prevent orphaned child processes
        (like cursor-agent's worker-server) from blocking communicate().
        """
        import os
        
        process = await asyncio.create_subprocess_shell(
            command,
            stdout=PIPE,
            stderr=PIPE,
            start_new_session=True  # Prevent orphan processes from blocking
        )
        
        try:
            stdout, stderr = await asyncio.wait_for(
                process.communicate(),
                timeout=self.timeout
            )
            
            output = stdout.decode('utf-8', errors='replace').strip()
            error = stderr.decode('utf-8', errors='replace').strip()
            
            # Filter out common SSH warnings and ANSI escape codes from stderr
            if error:
                error_lines = [
                    line for line in error.split('\n')
                    if not any(skip in line.lower() for skip in [
                        'warning:', 'known_hosts', 'permanently added'
                    ])
                ]
                error = '\n'.join(error_lines).strip()
            
            # Clean ANSI escape codes from output (cursor-agent may emit them)
            import re
            output = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]', '', output)
            
            return CLIResult(
                success=process.returncode == 0,
                output=output,
                error=error if error else None,
                exit_code=process.returncode or 0
            )
        except asyncio.TimeoutError:
            # Kill the entire process group
            try:
                os.killpg(process.pid, 9)
            except (OSError, ProcessLookupError):
                process.kill()
            raise
    
    async def check_cli_available(self, cli: str) -> bool:
        """Check if a CLI is available/installed."""
        try:
            command = f"{cli} --version"
            
            if self.cli_prefix:
                command = f'{self.cli_prefix} {shlex.quote(command)}'
            
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=PIPE,
                stderr=PIPE
            )
            await asyncio.wait_for(process.communicate(), timeout=10)
            return process.returncode == 0
        except:
            return False
    
    def get_execution_mode(self) -> str:
        """Return description of current execution mode."""
        if self.cli_prefix:
            return f"SSH via prefix: {self.cli_prefix[:50]}..."
        return "Direct execution on host"


# Global executor instance
_executor: Optional[CLIExecutor] = None


def get_cli_executor() -> CLIExecutor:
    """Get or create the global CLI executor instance."""
    global _executor
    if _executor is None:
        _executor = CLIExecutor()
    return _executor
