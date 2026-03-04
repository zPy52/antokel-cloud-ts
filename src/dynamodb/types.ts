export interface AwsConfig {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
}

export type Operator =
  | "="
  | "<"
  | "<="
  | ">"
  | ">="
  | "BETWEEN"
  | "IN"
  | "contains"
  | "begins_with"
  | "attribute_exists"
  | "attribute_not_exists"
  | "attribute_type"
  | "size";

export interface FilterExpression {
  field: string;
  operator: Operator;
  value?: any;
  value2?: any; // For BETWEEN
}

export interface QueryOptions {
  limit?: number;
  scanIndexForward?: boolean; // false for descending
  exclusiveStartKey?: Record<string, any>;
  indexName?: string;
}
