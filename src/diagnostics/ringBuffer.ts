export class RingBuffer<T> {
  private readonly items: Array<T | undefined>;
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = Math.max(0, Math.floor(capacity));
    this.items = new Array<T | undefined>(this.capacity);
  }

  get size(): number {
    return this.count;
  }

  push(item: T): void {
    if (this.capacity === 0) return;

    const writeIndex = (this.head + this.count) % this.capacity;
    if (this.count === this.capacity) {
      this.items[this.head] = item;
      this.head = (this.head + 1) % this.capacity;
      return;
    }

    this.items[writeIndex] = item;
    this.count += 1;
  }

  toArray(): T[] {
    const output: T[] = [];
    for (let offset = 0; offset < this.count; offset += 1) {
      const index = (this.head + offset) % this.capacity;
      output.push(this.items[index] as T);
    }
    return output;
  }

  clear(): void {
    this.items.fill(undefined);
    this.head = 0;
    this.count = 0;
  }
}
