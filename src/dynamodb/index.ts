import { z } from "zod";
import { FilterExpression, QueryOptions } from "./types";
import { DynamoDbService } from "./services/dynamodb-service";

export interface TableConfig<T extends z.ZodTypeAny> {
  tableName: string;
  schema: T;
  partitionKey: keyof z.infer<T>;
  sortKey?: keyof z.infer<T>;
}

export class AntokelDynamoDb<T extends z.ZodTypeAny> {
  constructor(private config: TableConfig<T>) {}

  /**
   * Perform an exact match on partition key + optional sorting key / filters.
   */
  public async get(partitionKeyValue: any, sortKeyValue?: any): Promise<z.infer<T> | null> {
    const key: any = { [this.config.partitionKey as string]: partitionKeyValue };
    if (this.config.sortKey && sortKeyValue !== undefined) {
      key[this.config.sortKey as string] = sortKeyValue;
    }
    
    const item = await DynamoDbService.crud.getItem(this.config.tableName, key);
    if (!item) return null;

    return this.config.schema.parse(item); // Validates schema returning out
  }

  /**
   * Save an item. Schema validation runs before sending.
   */
  public async put(item: z.infer<T>): Promise<void> {
    const validated = this.config.schema.parse(item);
    await DynamoDbService.crud.putItem(this.config.tableName, validated);
  }

  /**
   * Delete an item.
   */
  public async delete(partitionKeyValue: any, sortKeyValue?: any): Promise<void> {
    const key: any = { [this.config.partitionKey as string]: partitionKeyValue };
    if (this.config.sortKey && sortKeyValue !== undefined) {
      key[this.config.sortKey as string] = sortKeyValue;
    }
    await DynamoDbService.crud.deleteItem(this.config.tableName, key);
  }

  /**
   * Query operation on partition key with optional chained filters
   */
  public async query(
    partitionKeyValue: any,
    filters: FilterExpression[] = [],
    options?: QueryOptions
  ): Promise<{ items: z.infer<T>[]; lastEvaluatedKey?: Record<string, any> }> {
    const result = await DynamoDbService.query.executeQuery(
      this.config.tableName,
      this.config.partitionKey as string,
      partitionKeyValue,
      filters,
      options
    );

    return {
      items: result.items.map(i => this.config.schema.parse(i)), // Schema check on db results
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }

  /**
   * Table scans with chained filters
   */
  public async scan(
    filters: FilterExpression[] = [],
    options?: QueryOptions
  ): Promise<{ items: z.infer<T>[]; lastEvaluatedKey?: Record<string, any> }> {
    const result = await DynamoDbService.query.executeScan(this.config.tableName, filters, options);
    return {
      items: result.items.map(i => this.config.schema.parse(i)),
      lastEvaluatedKey: result.lastEvaluatedKey,
    };
  }
}

// Exporting the field builder for easy access
export { field } from "./models/field";
export { FilterExpression, QueryOptions } from "./types";
