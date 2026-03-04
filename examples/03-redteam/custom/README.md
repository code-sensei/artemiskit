# Custom Red Team Attacks

This folder contains custom attack definition files for red team testing.

## Files

- `custom-attacks-definition.yaml` - Example custom attack patterns (NOT a scenario)
- `custom-multi-turn.yaml` - Multi-turn attack scenario

## Usage

Custom attack definitions are **not** standalone scenarios. They define attack templates
that are applied to your prompts during red team testing.

```bash
# Use custom attacks with the --custom-attacks flag
akit redteam your-scenario.yaml --custom-attacks examples/03-redteam/custom/custom-attacks-definition.yaml

# Or with a prompt directly
akit redteam --prompt "You are a helpful assistant" \
  --custom-attacks examples/03-redteam/custom/custom-attacks-definition.yaml
```

## Custom Attack Definition Format

```yaml
version: "1.0"

attacks:
  - name: attack_name
    description: What this attack tests
    severity: low | medium | high | critical
    templates:
      - "Attack template with {{prompt}} placeholder"
      - "Another variation: {{prompt}}"
    variations:
      - name: variable_name
        values:
          - "value1"
          - "value2"
```

### Placeholders

- `{{prompt}}` - The original prompt being tested (required)
- `{{variableName}}` - Custom variables defined in `variations`

## Built-in Attack Categories

ArtemisKit includes these attack categories by default:

| Category | Description |
|----------|-------------|
| `injection` | Prompt injection attempts |
| `jailbreak` | Jailbreak and roleplay attacks |
| `extraction` | System prompt/data extraction |
| `hallucination` | Hallucination triggers |
| `pii` | PII disclosure attempts |

Use `--categories` to select specific built-in categories:

```bash
akit redteam scenario.yaml --categories injection,jailbreak
```
