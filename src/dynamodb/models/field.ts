import { FilterExpression, Operator } from '../types';

export const field = (name: string) => new _Field(name);

export class _Field {
  constructor(private fieldName: string) {}

  public isEqualTo(value: any): FilterExpression {
    return { field: this.fieldName, operator: '=', value };
  }

  public isLessThan(value: any): FilterExpression {
    return { field: this.fieldName, operator: '<', value };
  }

  public isLessThanOrEqualTo(value: any): FilterExpression {
    return { field: this.fieldName, operator: '<=', value };
  }

  public isGreaterThan(value: any): FilterExpression {
    return { field: this.fieldName, operator: '>', value };
  }

  public isGreaterThanOrEqualTo(value: any): FilterExpression {
    return { field: this.fieldName, operator: '>=', value };
  }

  public isBetween(value1: any, value2: any): FilterExpression {
    return { field: this.fieldName, operator: 'BETWEEN', value: value1, value2 };
  }

  public isAnyOf(values: any[]): FilterExpression {
    return { field: this.fieldName, operator: 'IN', value: values };
  }

  public contains(value: any): FilterExpression {
    return { field: this.fieldName, operator: 'contains', value };
  }

  public startsWith(value: string): FilterExpression {
    return { field: this.fieldName, operator: 'begins_with', value };
  }

  public exists(): FilterExpression {
    return { field: this.fieldName, operator: 'attribute_exists' };
  }

  public notExists(): FilterExpression {
    return { field: this.fieldName, operator: 'attribute_not_exists' };
  }

  public hasType(
    type: 'S' | 'N' | 'B' | 'BOOL' | 'NULL' | 'M' | 'L' | 'SS' | 'NS' | 'BS',
  ): FilterExpression {
    return { field: this.fieldName, operator: 'attribute_type', value: type };
  }

  public size(): FieldSize {
    return new FieldSize(this.fieldName);
  }
}

export class FieldSize {
  constructor(private fieldName: string) {}

  public isEqualTo(value: number): FilterExpression {
    return { field: this.fieldName, operator: 'size', value };
  }
}
