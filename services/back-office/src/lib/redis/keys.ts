// Cache key definitions with namespace prefix
const NAMESPACE = "back-office";

export const cacheKeys = {
  // Worker data
  workers: () => `${NAMESPACE}:workers`,
  workerByName: (name: string) => `${NAMESPACE}:worker:${name}`,
  
  // Schedule data
  schedules: () => `${NAMESPACE}:schedules`,
  scheduleByDataSourceId: (dataSourceId: number) => `${NAMESPACE}:schedule:${dataSourceId}`,
};

// TTL values in seconds
export const cacheTTL = {
  workers: 60 * 60 * 24,      // 24 hours - workers rarely change
  schedules: 60 * 60 * 24,    // 24 hours - schedules rarely change
};
