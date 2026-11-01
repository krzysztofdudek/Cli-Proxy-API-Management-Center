import { describe, expect, test } from 'bun:test';
import { createElement, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse as parseYaml } from 'yaml';
import {
  buildRoutingPlan,
  draftFromBoard,
  moveMember,
  resolveRoute,
} from '../src/features/routing/logic';
import { parseRoutingStrategy, useVisualConfig } from '../src/hooks/useVisualConfig';
import en from '../src/i18n/locales/en.json';
import ko from '../src/i18n/locales/ko.json';
import ru from '../src/i18n/locales/ru.json';
import tr from '../src/i18n/locales/tr.json';
import vi from '../src/i18n/locales/vi.json';
import zhCN from '../src/i18n/locales/zh-CN.json';
import zhTW from '../src/i18n/locales/zh-TW.json';
import {
  buildRoutingBoard,
  buildRoutingConfigPatch,
  readRoutingSettings,
} from '../src/services/api/routing';
import type { AuthFileItem } from '../src/types/authFile';
import { ROUTING_STRATEGIES, type RoutingModelCatalog } from '../src/types/routing';

type RoutingPatch = { routing?: { strategy?: unknown } };

const RAW = {
  routing: { strategy: 'reset-soonest', 'session-affinity': true },
  'api-keys': {},
};

const FILES: AuthFileItem[] = [
  { name: 'claude-a.json', type: 'claude', email: 'a@example.com', priority: 0 },
  { name: 'claude-b.json', type: 'claude', email: 'b@example.com', priority: 0 },
];

const catalog: RoutingModelCatalog = {
  channels: { claude: ['claude-sonnet-4'] },
  credentials: { 'claude-a.json': ['claude-sonnet-4'], 'claude-b.json': ['claude-sonnet-4'] },
};

const board = () => buildRoutingBoard(RAW, FILES);

describe('reset-soonest routing strategy', () => {
  test('is read as reset-soonest instead of falling back to round-robin', () => {
    expect(readRoutingSettings(RAW).strategy).toBe('reset-soonest');
    expect(parseRoutingStrategy('reset-soonest')).toBe('reset-soonest');
    expect(parseRoutingStrategy(' resetsoonest ')).toBe('reset-soonest');
    expect(ROUTING_STRATEGIES).toContain('reset-soonest');
  });

  test('saving other routing changes keeps the strategy untouched', () => {
    const current = board();
    const draft = draftFromBoard(current);
    expect(draft.settings.strategy).toBe('reset-soonest');
    draft.tiers = moveMember(draft.tiers, 'cred:claude-b.json', { kind: 'gap', index: 0 });
    const plan = buildRoutingPlan(current, draft);
    expect(plan.settings.strategy).toBeUndefined();
    const patch = buildRoutingConfigPatch(RAW, current, plan) as RoutingPatch | null;
    expect(patch?.routing?.strategy).toBeUndefined();
  });

  test('selecting it in the routing page writes reset-soonest', () => {
    const raw = { ...RAW, routing: { strategy: 'round-robin' } };
    const current = buildRoutingBoard(raw, FILES);
    const draft = draftFromBoard(current);
    draft.settings = { ...draft.settings, strategy: 'reset-soonest' };
    const plan = buildRoutingPlan(current, draft);
    expect(plan.settings).toEqual({ strategy: 'reset-soonest' });
    const patch = buildRoutingConfigPatch(raw, current, plan) as RoutingPatch;
    expect(patch.routing).toEqual({ strategy: 'reset-soonest' });
  });

  test('the route preview shows no fixed split', () => {
    const current = board();
    const preview = resolveRoute(current, draftFromBoard(current), catalog, null, 0);
    expect(preview.tiers[0].state).toBe('active');
    for (const member of preview.tiers[0].members) expect(member.share).toBeNull();
  });

  test('the visual config editor writes reset-soonest to YAML', () => {
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);
      if (phase === 0) {
        visualConfig.setVisualValues({ routingStrategy: 'reset-soonest' });
        setPhase(1);
        return null;
      }
      return createElement(
        'pre',
        null,
        visualConfig.applyVisualChangesToYaml('routing:\n  strategy: round-robin\n')
      );
    }
    const markup = renderToStaticMarkup(createElement(Harness));
    const result = markup.slice('<pre>'.length, -'</pre>'.length);
    expect(parseYaml(result)).toEqual({ routing: { strategy: 'reset-soonest' } });
  });

  test('editing another field in the visual config editor keeps reset-soonest', () => {
    const yaml = 'routing:\n  strategy: reset-soonest\n  session-affinity: true\n';
    function Harness() {
      const visualConfig = useVisualConfig();
      const [phase, setPhase] = useState(0);
      if (phase === 0) {
        visualConfig.loadVisualValuesFromYaml(yaml);
        setPhase(1);
        return null;
      }
      if (phase === 1) {
        visualConfig.setVisualValues({ requestRetry: '5' });
        setPhase(2);
        return null;
      }
      return createElement('pre', null, visualConfig.applyVisualChangesToYaml(yaml));
    }
    const markup = renderToStaticMarkup(createElement(Harness));
    const result = parseYaml(markup.slice('<pre>'.length, -'</pre>'.length));
    expect(result.routing.strategy).toBe('reset-soonest');
  });

  test('every locale labels and describes it', () => {
    for (const locale of [en, zhCN, zhTW, ru, vi, ko, tr] as Array<typeof en>) {
      expect(locale.basic_settings.routing_strategy_reset_soonest).toBeTruthy();
      expect(locale.config_management.visual.sections.network.strategy_reset_soonest).toBeTruthy();
      expect(locale.routing.strategy_reset_soonest).toBeTruthy();
      expect(locale.routing.strategy_reset_soonest_desc).toBeTruthy();
    }
  });
});
