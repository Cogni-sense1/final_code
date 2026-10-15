import fs from 'node:fs';
import path from 'node:path';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { env, isLocal } from './env';

export interface Item {
  pk: string;
  sk: string;
  gsi1pk?: string;
  gsi1sk?: string;
  /** Epoch seconds; DynamoDB deletes the item after this. */
  ttl?: number;
  [key: string]: unknown;
}

export interface QueryOpts {
  prefix?: string;
  /** Inclusive sort-key bounds. */
  from?: string;
  to?: string;
  limit?: number;
  desc?: boolean;
}

/** The whole persistence surface. Both adapters implement exactly this. */
export interface Store {
  get(pk: string, sk: string): Promise<Item | undefined>;
  put(item: Item): Promise<void>;
  delete(pk: string, sk: string): Promise<void>;
  query(pk: string, opts?: QueryOpts): Promise<Item[]>;
  queryGsi1(gsi1pk: string, opts?: QueryOpts): Promise<Item[]>;
}

const inRange = (sk: string, o: QueryOpts): boolean =>
  (o.prefix === undefined || sk.startsWith(o.prefix)) &&
  (o.from === undefined || sk >= o.from) &&
  (o.to === undefined || sk <= o.to);

/** In-memory table persisted to one JSON file. Used for local development and tests. */
export class FileStore implements Store {
  private items = new Map<string, Item>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private file: string | null) {
    if (file && fs.existsSync(file)) {
      for (const item of JSON.parse(fs.readFileSync(file, 'utf8')) as Item[]) this.items.set(`${item.pk}|${item.sk}`, item);
    }
  }

  private persist(): void {
    if (!this.file || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, 200);
  }

  flush(): void {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify([...this.items.values()]));
  }

  async get(pk: string, sk: string): Promise<Item | undefined> {
    const item = this.items.get(`${pk}|${sk}`);
    return item ? structuredClone(item) : undefined;
  }

  async put(item: Item): Promise<void> {
    this.items.set(`${item.pk}|${item.sk}`, structuredClone(item));
    this.persist();
  }

  async delete(pk: string, sk: string): Promise<void> {
    this.items.delete(`${pk}|${sk}`);
    this.persist();
  }

  private select(match: (i: Item) => string | undefined, opts: QueryOpts): Item[] {
    const now = Date.now() / 1000;
    const rows: [string, Item][] = [];
    for (const item of this.items.values()) {
      const sk = match(item);
      if (sk !== undefined && inRange(sk, opts) && (item.ttl === undefined || item.ttl > now)) rows.push([sk, item]);
    }
    rows.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    if (opts.desc) rows.reverse();
    return rows.slice(0, opts.limit ?? rows.length).map(([, i]) => structuredClone(i));
  }

  async query(pk: string, opts: QueryOpts = {}): Promise<Item[]> {
    return this.select((i) => (i.pk === pk ? i.sk : undefined), opts);
  }

  async queryGsi1(gsi1pk: string, opts: QueryOpts = {}): Promise<Item[]> {
    return this.select((i) => (i.gsi1pk === gsi1pk ? (i.gsi1sk ?? '') : undefined), opts);
  }
}

export class DynamoStore implements Store {
  private doc = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });

  constructor(private table: string) {}

  async get(pk: string, sk: string): Promise<Item | undefined> {
    const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: { pk, sk } }));
    return out.Item as Item | undefined;
  }

  async put(item: Item): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.table, Item: item }));
  }

  async delete(pk: string, sk: string): Promise<void> {
    await this.doc.send(new DeleteCommand({ TableName: this.table, Key: { pk, sk } }));
  }

  private async run(index: string | undefined, pkName: string, skName: string, pk: string, opts: QueryOpts): Promise<Item[]> {
    const names: Record<string, string> = { '#pk': pkName };
    const values: Record<string, unknown> = { ':pk': pk };
    let cond = '#pk = :pk';
    if (opts.from !== undefined || opts.to !== undefined) {
      names['#sk'] = skName;
      values[':from'] = opts.from ?? opts.prefix ?? '';
      values[':to'] = opts.to ?? `${opts.prefix ?? ''}￿`;
      cond += ' AND #sk BETWEEN :from AND :to';
    } else if (opts.prefix !== undefined) {
      names['#sk'] = skName;
      values[':prefix'] = opts.prefix;
      cond += ' AND begins_with(#sk, :prefix)';
    }
    const items: Item[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const out = await this.doc.send(new QueryCommand({
        TableName: this.table, IndexName: index, KeyConditionExpression: cond,
        ExpressionAttributeNames: names, ExpressionAttributeValues: values,
        ScanIndexForward: !opts.desc, Limit: opts.limit ? opts.limit - items.length : undefined, ExclusiveStartKey: startKey,
      }));
      items.push(...((out.Items ?? []) as Item[]));
      startKey = out.LastEvaluatedKey;
    } while (startKey && (!opts.limit || items.length < opts.limit));
    // A prefix combined with bounds is applied here, since DynamoDB allows one sort-key condition.
    return opts.prefix !== undefined ? items.filter((i) => String(i[skName] ?? '').startsWith(opts.prefix!)) : items;
  }

  query(pk: string, opts: QueryOpts = {}): Promise<Item[]> {
    return this.run(undefined, 'pk', 'sk', pk, opts);
  }

  queryGsi1(gsi1pk: string, opts: QueryOpts = {}): Promise<Item[]> {
    return this.run('gsi1', 'gsi1pk', 'gsi1sk', gsi1pk, opts);
  }
}

let store: Store | undefined;

export function getStore(): Store {
  store ??= isLocal() ? new FileStore(path.join(env.localDir, 'table.json')) : new DynamoStore(env.tableName);
  return store;
}

/** Tests swap in a throwaway in-memory store. */
export function setStore(s: Store): void {
  store = s;
}
