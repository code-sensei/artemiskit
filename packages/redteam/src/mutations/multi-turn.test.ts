/**
 * Tests for MultiTurnMutation
 */

import { describe, expect, test } from 'bun:test';
import { MultiTurnMutation, type ConversationTurn } from './multi-turn';

describe('MultiTurnMutation', () => {
  test('mutation has correct metadata', () => {
    const mutation = new MultiTurnMutation();
    expect(mutation.name).toBe('multi_turn');
    expect(mutation.severity).toBe('critical');
  });

  test('default strategy is gradual_escalation', () => {
    const mutation = new MultiTurnMutation();
    const mutated = mutation.mutate('test prompt');

    expect(mutated).toBeDefined();
    expect(typeof mutated).toBe('string');
    expect(mutated).toContain('test prompt');
  });

  test('generates conversation with default strategy', () => {
    const mutation = new MultiTurnMutation('gradual_escalation');
    const conversation = mutation.generateConversation('attack prompt');

    expect(Array.isArray(conversation)).toBe(true);
    expect(conversation.length).toBeGreaterThan(1);

    // Last message should contain the attack prompt
    const lastMessage = conversation[conversation.length - 1];
    expect(lastMessage.role).toBe('user');
    expect(lastMessage.content).toContain('attack prompt');
  });

  test('supports context_switching strategy', () => {
    const mutation = new MultiTurnMutation('context_switching');
    const conversation = mutation.generateConversation('test prompt');

    expect(Array.isArray(conversation)).toBe(true);
    expect(conversation.length).toBeGreaterThan(1);
  });

  test('supports persona_building strategy', () => {
    const mutation = new MultiTurnMutation('persona_building');
    const conversation = mutation.generateConversation('test prompt');

    expect(Array.isArray(conversation)).toBe(true);
    expect(conversation.length).toBeGreaterThan(1);
  });

  test('supports distraction strategy', () => {
    const mutation = new MultiTurnMutation('distraction');
    const conversation = mutation.generateConversation('test prompt');

    expect(Array.isArray(conversation)).toBe(true);
    expect(conversation.length).toBeGreaterThan(1);
  });

  test('custom prefix overrides strategy-based generation', () => {
    const mutation = new MultiTurnMutation('gradual_escalation');

    const customPrefix: ConversationTurn[] = [
      { role: 'user', content: 'Custom first message' },
      { role: 'assistant', content: 'Custom response' },
    ];

    mutation.setConversationPrefix(customPrefix);
    expect(mutation.hasCustomPrefix()).toBe(true);

    const conversation = mutation.generateConversation('attack prompt');

    expect(conversation.length).toBe(3); // 2 prefix + 1 attack
    expect(conversation[0].content).toBe('Custom first message');
    expect(conversation[1].content).toBe('Custom response');
    expect(conversation[2].content).toBe('attack prompt');
  });

  test('clearConversationPrefix removes custom prefix', () => {
    const mutation = new MultiTurnMutation();

    const customPrefix: ConversationTurn[] = [{ role: 'user', content: 'Custom message' }];

    mutation.setConversationPrefix(customPrefix);
    expect(mutation.hasCustomPrefix()).toBe(true);

    mutation.clearConversationPrefix();
    expect(mutation.hasCustomPrefix()).toBe(false);
  });

  test('mutate with custom prefix formats conversation correctly', () => {
    const mutation = new MultiTurnMutation();

    const customPrefix: ConversationTurn[] = [
      { role: 'user', content: 'Hello there' },
      { role: 'assistant', content: 'Hi, how can I help?' },
    ];

    mutation.setConversationPrefix(customPrefix);
    const mutated = mutation.mutate('My actual request');

    expect(mutated).toContain('[USER]: Hello there');
    expect(mutated).toContain('[ASSISTANT]: Hi, how can I help?');
    expect(mutated).toContain('[USER]: My actual request');
  });

  test('supports system role in custom prefix', () => {
    const mutation = new MultiTurnMutation();

    const customPrefix: ConversationTurn[] = [
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    mutation.setConversationPrefix(customPrefix);
    const conversation = mutation.generateConversation('test');

    expect(conversation.length).toBe(4);
    expect(conversation[0].role).toBe('system');
  });

  test('constructor accepts options object', () => {
    const mutation = new MultiTurnMutation({
      strategy: 'distraction',
    });

    // Should use distraction strategy
    const conversation = mutation.generateConversation('test');
    expect(Array.isArray(conversation)).toBe(true);
  });

  test('empty prefix falls back to strategy-based generation', () => {
    const mutation = new MultiTurnMutation('gradual_escalation');

    mutation.setConversationPrefix([]);
    expect(mutation.hasCustomPrefix()).toBe(false);

    const conversation = mutation.generateConversation('test');
    // Should generate strategy-based conversation (more than 1 turn)
    expect(conversation.length).toBeGreaterThan(1);
  });
});
