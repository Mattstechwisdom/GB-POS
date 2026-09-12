export function createCheckoutSessionRegistry() {
  const sessions = new Map<number, (result: any) => void>();
  return {
    register(id: number, complete: (result: any) => void) {
      sessions.set(id, complete);
    },
    complete(id: number, result: any) {
      const complete = sessions.get(id);
      if (!complete) return false;
      sessions.delete(id);
      complete(result);
      return true;
    },
    cancel(id: number) {
      return this.complete(id, null);
    },
  };
}
