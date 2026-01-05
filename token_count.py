#!/usr/bin/env python3
import sys
import os

try:
    import tiktoken
    enc = tiktoken.get_encoding('cl100k_base')
    use_tiktoken = True
except ImportError:
    use_tiktoken = False

def count_tokens(text):
    if use_tiktoken:
        return len(enc.encode(text))
    else:
        # Fallback approximation: 1 token ≈ 4 characters
        return len(text) // 4

# Read files
skill_path = 'instruction/skills/delegate/SKILL.md'
examples_path = 'instruction/skills/delegate/references/examples.md'

with open(skill_path, 'r', encoding='utf-8') as f:
    skill_content = f.read()

with open(examples_path, 'r', encoding='utf-8') as f:
    examples_content = f.read()

# Count tokens
skill_tokens = count_tokens(skill_content)
examples_tokens = count_tokens(examples_content)
total_tokens = skill_tokens + examples_tokens

print(f'SKILL.md tokens: {skill_tokens}')
print(f'examples.md tokens: {examples_tokens}')
print(f'Total tokens: {total_tokens}')

# Store results for output file
results = {
    'skill_tokens': skill_tokens,
    'examples_tokens': examples_tokens,
    'total_tokens': total_tokens,
    'method': 'tiktoken' if use_tiktoken else 'approximation'
}
