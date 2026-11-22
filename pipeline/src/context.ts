// Everything a stage needs, wired once per process so all Kieze share limiters and the budget.
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CostLedger } from './ledger.ts';
import type { Llm } from './llm/llm.ts';
import type { ImageGenerator } from './sources/images.ts';
import type { OsmSource } from './sources/osm.ts';
import type { PlacesClient } from './sources/places.ts';
import type { MenuFetcher } from './sources/website.ts';
import type { Db } from './store/db.ts';

export interface Models {
  menu: string;
  nutrition: string;
  chief: string;
  second: string;
  /** Light model for translating descriptions to German. */
  translate: string;
}

export type LlmProvider = 'anthropic' | 'openai';

export interface PipelineOptions {
  /** Grid cell size for stage 1 tiles. */
  tileMeters: number;
  /** Max quadtree depth when a tile is saturated (60 results). */
  maxTileDepth: number;
  /** Rating filter (applied in memory; ratings are never stored). */
  minRating: number;
  /** Max restaurants per Kiez that enter stage 2 and later (null = all). */
  maxRestaurantsPerKiez: number | null;
  /** AI images per restaurant (top dishes by health score). */
  aiImagesPerRestaurant: number;
  /** Look up the website via Place Details when OSM has none (used transiently, never stored). */
  usePlacesWebsite: boolean;
  /** Parallel restaurants per stage within one Kiez. */
  restaurantConcurrency: number;
  /** Review sample per Kiez: restaurants and dishes per restaurant. */
  reviewRestaurants: number;
  reviewDishes: number;
  /** Stage 1 searches the healthy terms (stages/find-healthy.ts) instead of the "restaurant" tile grid. */
  healthySearch: boolean;
  /** With healthySearch: run only the free IDs-only probes and report the paid pages a real run would fetch. */
  placesProbeOnly: boolean;
}

export interface PlacesDetails {
  website(placeId: string, kiez?: string): Promise<string | null>;
}

export interface Ctx {
  db: Db;
  ledger: CostLedger;
  llm: Llm;
  images: ImageGenerator;
  osm: OsmSource;
  places: PlacesClient & Partial<PlacesDetails>;
  menus: MenuFetcher;
  models: Models;
  opts: PipelineOptions;
  dataDir: string;
  log: (msg: string) => void;
}

const PROVIDER_MODELS: Record<LlmProvider, Models> = {
  anthropic: { menu: 'claude-opus-5-5', nutrition: 'claude-opus-5-5', chief: 'claude-opus-5-5', second: 'claude-sonnet-5-5', translate: 'claude-haiku-5-5' },
  openai: { menu: 'gpt-6.2-sol', nutrition: 'gpt-6.2-sol', chief: 'gpt-6.2-sol', second: 'gpt-6.1-terra', translate: 'gpt-6-luna' },
};

/** PIPELINE_LLM_PROVIDER wins; otherwise Anthropic when its key is set, else OpenAI. */
export function llmProvider(env: NodeJS.ProcessEnv = process.env): LlmProvider {
  const p = env.PIPELINE_LLM_PROVIDER?.toLowerCase();
  if (p === 'anthropic' || p === 'openai') return p;
  if (p) throw new Error(`PIPELINE_LLM_PROVIDER must be anthropic or openai, got ${p}`);
  return env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai';
}

/** Models per role for a provider; PIPELINE_MODEL_<ROLE> overrides one role. */
export function modelsFor(provider: LlmProvider, env: NodeJS.ProcessEnv = process.env): Models {
  const d = PROVIDER_MODELS[provider];
  return {
    menu: env.PIPELINE_MODEL_MENU ?? d.menu,
    nutrition: env.PIPELINE_MODEL_NUTRITION ?? d.nutrition,
    chief: env.PIPELINE_MODEL_CHIEF ?? d.chief,
    second: env.PIPELINE_MODEL_SECOND ?? d.second,
    translate: env.PIPELINE_MODEL_TRANSLATE ?? d.translate,
  };
}

export const DEFAULT_MODELS: Models = PROVIDER_MODELS.anthropic;

export const DEFAULT_OPTIONS: PipelineOptions = {
  tileMeters: 800,
  maxTileDepth: 4,
  minRating: 4.3,
  maxRestaurantsPerKiez: 50,
  aiImagesPerRestaurant: 1,
  usePlacesWebsite: true,
  restaurantConcurrency: 6,
  reviewRestaurants: 8,
  reviewDishes: 3,
  healthySearch: false,
  placesProbeOnly: false,
};

export const PIPELINE_ROOT = fileURLToPath(new URL('..', import.meta.url).href);

/** Local data dir (SQLite file, images, exports). Gitignored default inside pipeline/. */
export function defaultDataDir(): string {
  return process.env.PIPELINE_DATA_DIR ?? join(PIPELINE_ROOT, '.data');
}

/** Cost ledger: PIPELINE_LEDGER, else the Firstmate key-spend ledger when present, else the data dir. */
export function defaultLedgerPath(dataDir: string): string {
  if (process.env.PIPELINE_LEDGER) return process.env.PIPELINE_LEDGER;
  const fm = join(homedir(), '.firstmate-secondmate-launchlab', 'data', 'key-spend', 'ledger.jsonl');
  return existsSync(fm) ? fm : join(dataDir, 'ledger.jsonl');
}
