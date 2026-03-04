import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { FilterExpression, QueryOptions } from "../types";
import { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand, QueryCommand, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export class SubmoduleDynamoDbServiceCrud {
  constructor(private docClient: DynamoDBDocumentClient) {}

  public async putItem(tableName: string, finalItem: any): Promise<void> {
    await this.docClient.send(
      new PutCommand({
        TableName: tableName,
        Item: finalItem,
      })
    );
  }

  public async getItem(tableName: string, key: Record<string, any>): Promise<any | null> {
    const response = await this.docClient.send(
      new GetCommand({
        TableName: tableName,
        Key: key,
      })
    );
    return response.Item ?? null;
  }

  public async deleteItem(tableName: string, key: Record<string, any>): Promise<void> {
    await this.docClient.send(
      new DeleteCommand({
        TableName: tableName,
        Key: key,
      })
    );
  }

  // A basic update wrapper (often needs ExpressionAttributeValues in real usage, simplified here)
  public async updateItem(
    tableName: string,
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>
  ): Promise<any> {
    const response = await this.docClient.send(
      new UpdateCommand({
        TableName: tableName,
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      })
    );
    return response.Attributes;
  }
}

export class SubmoduleDynamoDbServiceQuery {
  constructor(private docClient: DynamoDBDocumentClient) {}

  public async executeQuery(
    tableName: string,
    partitionKeyName: string,
    partitionKeyValue: any,
    filters: FilterExpression[],
    options?: QueryOptions
  ): Promise<{ items: any[]; lastEvaluatedKey?: Record<string, any> }> {
    const { FilterExpression, ExpressionAttributeNames, ExpressionAttributeValues } = this.buildConditionExpressions(filters);

    const keyConditionExpression = `#pk = :pk`;
    const mergedNames = { ...ExpressionAttributeNames, "#pk": partitionKeyName };
    const mergedValues = { ...ExpressionAttributeValues, ":pk": partitionKeyValue };

    const response = await this.docClient.send(
      new QueryCommand({
        TableName: tableName,
        IndexName: options?.indexName,
        KeyConditionExpression: keyConditionExpression,
        FilterExpression: FilterExpression || undefined,
        ExpressionAttributeNames: Object.keys(mergedNames).length ? mergedNames : undefined,
        ExpressionAttributeValues: Object.keys(mergedValues).length ? mergedValues : undefined,
        Limit: options?.limit,
        ScanIndexForward: options?.scanIndexForward,
        ExclusiveStartKey: options?.exclusiveStartKey,
      })
    );

    return {
      items: response.Items ?? [],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  public async executeScan(
    tableName: string,
    filters: FilterExpression[],
    options?: QueryOptions
  ): Promise<{ items: any[]; lastEvaluatedKey?: Record<string, any> }> {
    const { FilterExpression, ExpressionAttributeNames, ExpressionAttributeValues } = this.buildConditionExpressions(filters);

    const response = await this.docClient.send(
      new ScanCommand({
        TableName: tableName,
        IndexName: options?.indexName,
        FilterExpression: FilterExpression || undefined,
        ExpressionAttributeNames: Object.keys(ExpressionAttributeNames).length ? ExpressionAttributeNames : undefined,
        ExpressionAttributeValues: Object.keys(ExpressionAttributeValues).length ? ExpressionAttributeValues : undefined,
        Limit: options?.limit,
        ExclusiveStartKey: options?.exclusiveStartKey,
      })
    );

    return {
      items: response.Items ?? [],
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  /**
   * Translates our FilterExpression AST to DynamoDB expression syntax
   */
  private buildConditionExpressions(filters: FilterExpression[]) {
    if (!filters.length) return { FilterExpression: "", ExpressionAttributeNames: {}, ExpressionAttributeValues: {} };

    const expressionParts: string[] = [];
    const ExpressionAttributeNames: Record<string, string> = {};
    const ExpressionAttributeValues: Record<string, any> = {};

    filters.forEach((filter, i) => {
      const nameKey = `#f${i}`;
      ExpressionAttributeNames[nameKey] = filter.field;

      const valKey = `:v${i}`;
      const val2Key = `:v2${i}`;

      switch (filter.operator) {
        case "=":
        case "<":
        case "<=":
        case ">":
        case ">=":
          expressionParts.push(`${nameKey} ${filter.operator} ${valKey}`);
          ExpressionAttributeValues[valKey] = filter.value;
          break;
        case "BETWEEN":
          expressionParts.push(`${nameKey} BETWEEN ${valKey} AND ${val2Key}`);
          ExpressionAttributeValues[valKey] = filter.value;
          ExpressionAttributeValues[val2Key] = filter.value2;
          break;
        case "IN":
          if (Array.isArray(filter.value) && filter.value.length > 0) {
            const inKeys = filter.value.map((_, idx) => `:in${i}_${idx}`);
            expressionParts.push(`${nameKey} IN (${inKeys.join(", ")})`);
            filter.value.forEach((v, idx) => {
              ExpressionAttributeValues[`:in${i}_${idx}`] = v;
            });
          }
          break;
        case "contains":
          expressionParts.push(`contains(${nameKey}, ${valKey})`);
          ExpressionAttributeValues[valKey] = filter.value;
          break;
        case "begins_with":
          expressionParts.push(`begins_with(${nameKey}, ${valKey})`);
          ExpressionAttributeValues[valKey] = filter.value;
          break;
        case "attribute_exists":
          expressionParts.push(`attribute_exists(${nameKey})`);
          break;
        case "attribute_not_exists":
          expressionParts.push(`attribute_not_exists(${nameKey})`);
          break;
        case "attribute_type":
          expressionParts.push(`attribute_type(${nameKey}, ${valKey})`);
          ExpressionAttributeValues[valKey] = filter.value;
          break;
        case "size":
          expressionParts.push(`size(${nameKey}) = ${valKey}`);
          ExpressionAttributeValues[valKey] = filter.value;
          break;
      }
    });

    return {
      FilterExpression: expressionParts.join(" AND "),
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    };
  }
}

export class DynamoDbService {
  private static clientObj: DynamoDBClient | null = null;
  private static docClientObj: DynamoDBDocumentClient | null = null;

  public static initializeClient(config: { region?: string; accessKeyId?: string; secretAccessKey?: string }) {
    if (!this.clientObj) {
      const awsConfig: any = { region: config.region || process.env.AWS_REGION || "us-east-1" };
      
      if (config.accessKeyId && config.secretAccessKey) {
        awsConfig.credentials = {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        };
      }

      this.clientObj = new DynamoDBClient(awsConfig);
      this.docClientObj = DynamoDBDocumentClient.from(this.clientObj, {
        marshallOptions: { removeUndefinedValues: true },
      });
      
      this._crud = new SubmoduleDynamoDbServiceCrud(this.docClientObj);
      this._query = new SubmoduleDynamoDbServiceQuery(this.docClientObj);
    }
  }

  private static _crud: SubmoduleDynamoDbServiceCrud;
  public static get crud(): SubmoduleDynamoDbServiceCrud {
    if (!this._crud) throw new Error("DynamoDbService not initialized. Call AntokelAws first.");
    return this._crud;
  }

  private static _query: SubmoduleDynamoDbServiceQuery;
  public static get query(): SubmoduleDynamoDbServiceQuery {
    if (!this._query) throw new Error("DynamoDbService not initialized. Call AntokelAws first.");
    return this._query;
  }
}
