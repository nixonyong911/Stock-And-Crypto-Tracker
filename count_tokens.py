#!/usr/bin/env python3
"""Count tokens in .md files using tiktoken"""

try:
    import tiktoken
except ImportError:
    print("tiktoken not available, using approximation")
    tiktoken = None

import os

def count_tokens_tiktoken(content):
    """Count tokens using tiktoken"""
    encoding = tiktoken.get_encoding('cl100k_base')
    tokens = encoding.encode(content)
    return len(tokens)

def count_tokens_approx(content):
    """Approximate token count: ~4 chars per token"""
    return len(content) // 4

md_files = [
    'instruction/skills/worker/SKILL.md',
    'instruction/skills/worker/references/cicd-pipeline/REFERENCE.md',
    'instruction/skills/worker/references/grafana-dashboard/REFERENCE.md',
    'instruction/skills/worker/references/scheduling/REFERENCE.md',
    'instruction/skills/worker/references/verification/REFERENCE.md',
    'instruction/skills/worker/references/database-setup/REFERENCE.md',
    'instruction/skills/worker/references/metrics-integration/REFERENCE.md',
    'instruction/skills/worker/references/api-endpoints/REFERENCE.md',
    'instruction/skills/worker/references/troubleshooting/REFERENCE.md',
    'instruction/skills/worker/references/coding-standards/REFERENCE.md'
]

total_tokens = 0
file_counts = {}

for file_path in md_files:
    if os.path.exists(file_path):
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            if tiktoken:
                token_count = count_tokens_tiktoken(content)
            else:
                token_count = count_tokens_approx(content)
            file_counts[file_path] = token_count
            total_tokens += token_count
            print(f'{file_path}: {token_count:,} tokens')
    else:
        print(f'Warning: {file_path} not found')

print(f'\nTotal tokens: {total_tokens:,}')
