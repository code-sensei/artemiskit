# Getting Started Scenarios

These example scenarios help you learn ArtemisKit step by step.

## Prerequisites

1. Install ArtemisKit: `npm install -g @artemiskit/cli`
2. Set your API key: `export OPENAI_API_KEY="sk-..."`

## Scenarios

Run these in order to learn the basics:

### 1. Hello World
The simplest possible scenario. Start here to verify your setup works.

```bash
artemiskit run examples/scenarios/getting-started/hello-world.yaml
```

### 2. Basic Assertions
Learn all the assertion types: `contains`, `not-contains`, `regex`, `exact`.

```bash
artemiskit run examples/scenarios/getting-started/basic-assertions.yaml
```

### 3. Multi-Turn Conversations
Test conversations with multiple back-and-forth exchanges.

```bash
artemiskit run examples/scenarios/getting-started/multi-turn-conversation.yaml
```

### 4. Variables
Make your scenarios dynamic with variable substitution.

```bash
artemiskit run examples/scenarios/getting-started/with-variables.yaml
```

## Next Steps

After completing these, explore:

- `examples/scenarios/evaluators/` - More assertion patterns
- `examples/scenarios/redteam/` - Security testing scenarios
- `examples/scenarios/use-cases/` - Real-world examples

## Tips

- Use `--verbose` flag to see detailed output
- Use `--save` to store results for later comparison
- Use `akit` as a shortcut for `artemiskit`
