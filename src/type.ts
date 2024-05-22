export interface RetryChunkLoadPluginOptions {
  /**
   * optional list of chunks to which retry script should be injected
   * if not set will add retry script to all chunks that have webpack script loading
   */
  chunks?: string[];
  /**
   * optional value to set the maximum number of retries to load the chunk. Default is 1
   */
  maxRetries?: number;
  /**
   * optional number value to set the amount of time in milliseconds before trying to load the chunk again. Default is 0
   * if string, value must be code to generate a delay value. Receives retryCount as argument
   * e.g. `function(retryAttempt) { return retryAttempt * 1000 }`
   */
  retryDelay?: number | string;
  /**
   * If the current domain has reached the maximum number of retry attempts, it will switch to requesting from another domain.
   * If not specified, it will not switch to requesting from another domain.
   */
  otherDomain?: string[]
  /**
   * Maximum number of retry attempts for requesting from other domains, default is 1.
   */
  otherDomainMaxRetries?: number
  /** Callbacks that will be called at different stages of the retry */
  reloadTrackFn?: (status: ERELOAD_STATUS, domain: string, chunk: string, retriesTimes: number) => void
}

export enum ERELOAD_STATUS {
  // Needs to go through the retry logic
  FIRST_LOAD_ERROR = 0,
  // CDN retry successful
  CDN_SUCCESS = 1,
  // CDN retry fail
  CDN_FAIL = 2,
  // Other Domain retry successful
  DOMAIN_SUCCESS = 3,
  // Other Domain retry fail
  DOMAIN_FAIL = 4
}