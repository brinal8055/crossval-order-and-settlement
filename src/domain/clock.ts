import { formatUtcDate } from "./dates";

export interface Clock {
  now(): Date;
  today(): string;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }

  today(): string {
    return formatUtcDate(this.now());
  }
}

export class FixedClock implements Clock {
  private readonly current: Date;

  constructor(current: Date) {
    this.current = new Date(current.getTime());
  }

  now(): Date {
    return new Date(this.current.getTime());
  }

  today(): string {
    return formatUtcDate(this.current);
  }
}

