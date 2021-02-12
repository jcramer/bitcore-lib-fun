export class CacheSet<T> {
  private set = new Set<T>();
  private list: T[] = [];
  private maxSize: number;

  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }

  public [Symbol.iterator]() {
    return this.list.values();
  }

  get length(): number {
    return this.list.length;
  }

  public push(item: T) {
    this.set.add(item);
    if (this.maxSize > 0 && this.set.size > this.maxSize) {
    this.shift();
    }
    return this.list.push(item);
  }

  public has(item: T) {
    return this.set.has(item);
  }

  public delete(item: T) {
    if (this.set.delete(item)) {
      this.list = this.list.filter(k => k !== item);
    }
  }

  public toSet() {
    return this.set;
  }

  public shift(): T | undefined {
    const item = this.list.shift();
    if (item) {
      this.set.delete(item);
    }
    return item;
  }

  public pop(): T | undefined {
    const item = this.list.pop();
    if (item) {
      this.set.delete(item);
    }
    return item;
  }

  public clear() {
    this.list = [];
    this.set.clear();
  }
}
  