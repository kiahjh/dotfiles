export class Progress {
  private current = 0;

  constructor(
    private readonly title: string,
    private readonly total: number,
  ) {
    console.log(`\n${title}`);
  }

  step(label: string): void {
    this.current += 1;
    console.log(`\n${this.meter()} ${label}`);
  }

  note(message: string): void {
    console.log(`  ${message}`);
  }

  skip(message: string): void {
    console.log(`  ↷ ${message}`);
  }

  done(message: string): void {
    console.log(`  ✓ ${message}`);
  }

  ready(message: string): void {
    console.log(`\n✓ ${message}`);
  }

  private meter(): string {
    const width = Math.min(10, Math.max(4, this.total));
    const filled = Math.max(1, Math.round((this.current / this.total) * width));
    const empty = Math.max(0, width - filled);
    return `${"━".repeat(filled)}${"·".repeat(empty)} ${this.current}/${this.total}`;
  }
}
