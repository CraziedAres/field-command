import { parentPort } from 'node:worker_threads';
import { makeBot, type Bot } from '../bots/index.ts';
import { playGame } from '../selfplay.ts';

export interface Job {
  blue: string;
  red: string;
  seed: number;
  maxDays: number;
}

const bots = new Map<string, Bot>();
const bot = (spec: string) => bots.get(spec) ?? bots.set(spec, makeBot(spec)).get(spec)!;

parentPort!.on('message', (job: Job | null) => {
  if (job === null) return process.exit(0);
  parentPort!.postMessage(playGame(bot(job.blue), bot(job.red), { seed: job.seed, maxDays: job.maxDays }));
});
