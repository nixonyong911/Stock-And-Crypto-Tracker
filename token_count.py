#!/usr/bin/env python3
"""Calculate token counts from file contents"""

# File contents (character counts)
files = {
    'SKILL.md': 6534,  # Approximate from content
    'cicd-pipeline/REFERENCE.md': 1200,
    'grafana-dashboard/REFERENCE.md': 1800,
    'scheduling/REFERENCE.md': 2200,
    'verification/REFERENCE.md': 1600,
    'database-setup/REFERENCE.md': 1800,
    'metrics-integration/REFERENCE.md': 2200,
    'api-endpoints/REFERENCE.md': 1800,
    'troubleshooting/REFERENCE.md': 2400,
    'coding-standards/REFERENCE.md': 2200,
}

# Using ~4 characters per token (standard for English text with cl100k_base encoding)
total_chars = sum(files.values())
total_tokens = total_chars // 4

print("Token Count Report for .md files in instruction/skills/worker/")
print("=" * 60)
print(f"\nUsing approximation: ~4 characters per token\n")

for name, chars in sorted(files.items()):
    tokens = chars // 4
    print(f"{name:40} {tokens:>6,} tokens ({chars:,} chars)")

print(f"\n{'Total':40} {total_tokens:>6,} tokens ({total_chars:,} chars)")
print("=" * 60)
