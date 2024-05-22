import { format } from 'prettier'
import { Compiler, RuntimeGlobals } from 'webpack';
import { RetryChunkLoadPluginOptions } from './type';

const pluginName = 'ReLoadChunkPlugin';

const getRetryTimesFn = (maxRetryValueFromOptions: number) => {
  return Number.isInteger(maxRetryValueFromOptions) && maxRetryValueFromOptions > 0 ? maxRetryValueFromOptions : 1;
}

export class RetryChunkLoadPlugin {
  options: RetryChunkLoadPluginOptions;

  constructor(options: RetryChunkLoadPluginOptions = {}) {
    this.options = Object.assign({}, options);
  }

  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap(pluginName, compilation => {
      const { mainTemplate, runtimeTemplate } = compilation;

      const maxRetryValueFromOptions = Number(this.options.maxRetries);
      const maxRetries = getRetryTimesFn(maxRetryValueFromOptions)

      const otherDomainMaxRetries = this.options.otherDomainMaxRetries || 0;
      const otherDomainMaxRetryValueFromOptions = this.options.otherDomain?.reduce((acc, cur) => {
        acc[cur] = getRetryTimesFn(otherDomainMaxRetries)
        return acc
      }, {} as Record<string, number>)
      const otherDomain = this.options.otherDomain || []

      // const reloadTrackFn = this.options.reloadTrackFn
      mainTemplate.hooks.localVars.tap({ name: pluginName, stage: 1 }, (source, chunk) => {
        const currentChunkName = chunk.name;
        const addRetryCode = !this.options.chunks || this.options.chunks.includes(currentChunkName!);
        const getRetryDelay = typeof this.options.retryDelay === 'string'
            ? this.options.retryDelay
            : `function() { return ${this.options.retryDelay || 0} }`;
        if (!addRetryCode) return source;

        const script = runtimeTemplate.iife(
          '',
          `
        if(typeof ${RuntimeGlobals.require} !== "undefined") {
          var oldGetScript = ${RuntimeGlobals.getChunkScriptFilename};
          var oldLoadScript = ${RuntimeGlobals.ensureChunk};
          var oldPublicPath = ${RuntimeGlobals.publicPath};
          var countMap = {};
          var otherDomainArr = ${JSON.stringify(otherDomain)}
          var curDomainRetryMap = {};
          var otherDomainMaxRetryValueFromOptions = ${JSON.stringify(otherDomainMaxRetryValueFromOptions)}
          var getRetryDelay = ${getRetryDelay}

          ${RuntimeGlobals.getChunkScriptFilename} = function(chunkId){
            var result = oldGetScript(chunkId);
            return result 
          };

          var getChunkFromBaseDomain = function (chunkId, realChunkName, resolve, reject) {
            var curDomain = otherDomainArr[curDomainRetryMap[chunkId].curDomainIndex]
            var domainUrl = 'https://' + curDomain + oldPublicPath + realChunkName;
            ${RuntimeGlobals.loadScript}(domainUrl, function (e) {
                if(e.type === 'error') {
                    if (curDomainRetryMap[chunkId].curDomainRetry <= 1) {
                        curDomainRetryMap[chunkId] = {
                            curDomainIndex: ++curDomainRetryMap[chunkId].curDomainIndex,
                            curDomainRetry: ${otherDomainMaxRetries}
                        }
                        if(!otherDomainArr[curDomainRetryMap[chunkId].curDomainIndex]) {
                          reject(e);
                          return
                        }
                    } else {
                      curDomainRetryMap[chunkId].curDomainRetry--;
                    }
                    getChunkFromBaseDomain(chunkId, realChunkName, resolve, reject);
                } else {
                    // 加载成功
                    resolve();
                }
            });
        }

          ${RuntimeGlobals.ensureChunk} = function(chunkId) {
            var result = oldLoadScript(chunkId);
            return result.catch(function(error) {
              var retries = countMap.hasOwnProperty(chunkId) ? countMap[chunkId] : ${maxRetries};
              if (retries < 1) {
                var realSrc = oldGetScript(chunkId);
                error.message = 'Loading chunk ' + chunkId + ' failed after ${maxRetries} retries.\\n(' + realSrc + ')';

                if (otherDomainArr.length === 0) {
                  throw error;
                }

                return new Promise(function (resolve, reject) {
                  setTimeout(function () {
                    if (curDomainRetryMap[chunkId]) {
                      curDomainRetryMap[chunkId] = {
                        curDomainIndex:  curDomainRetryMap[chunkId].curDomainIndex,
                        curDomainRetry: curDomainRetryMap[chunkId].curDomainRetry
                      }
                    } else {
                      curDomainRetryMap[chunkId] = {
                        curDomainIndex: 0,
                        curDomainRetry: ${otherDomainMaxRetries}
                      }
                    }
                    getChunkFromBaseDomain(chunkId, realSrc, resolve, reject);
                  }, getRetryDelay())
                })
              } else {
                return new Promise(function (resolve) {
                  var retryAttempt = ${maxRetries} - retries + 1;
                  setTimeout(function () {
                    countMap[chunkId] = retries - 1;
                    resolve(${RuntimeGlobals.ensureChunk}(chunkId));
                  }, getRetryDelay(retryAttempt))
                })
              }
            });
          };
        }`
        );
        return (
          source +
          format(script, {
            trailingComma: 'es5',
            singleQuote: true,
            parser: 'babel',
          })
        );
        }
      );
    });
  }
}
