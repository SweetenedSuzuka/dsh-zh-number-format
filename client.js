// 中文计数插件 —— 客户端部分。
//
// 作用范围：DSH 的前端界面（ctx.locale）。
// DSH 中所有可见文本都在 LocaleRuntime.translate(ns, key, params) 解析。
// 「number.thousand / number.million / tokens.thousand / tokens.million」是三位分节模板，「number.groupSeparator」提供千分位逗号。

window.__ModuleLoader__.load({
	id: '@local/dsh-zh-number-format',
	factory() {
		'use strict';

		// #region 四位分级

		/**
		 * 把非负数按四位分级显示：小于一万显示原数；一万起按万/亿/兆（兆 = 10^12）保留一位小数（严格四舍五入，去掉多余的 .0）。
		 * 进位时升到更高单位（9999.99万应为1亿）。
		 * @param {number} value 非负数值。
		 * @returns {string|null} 四位分级字符串；输入参数无法处理时返回 null。
		 */
		function zhCompact(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
			const n = Math.round(value);
			if (n < 1e4) return String(n);
			let scale;
			let unit;
			if (n >= 1e12) { scale = 1e12; unit = '兆'; }
			else if (n >= 1e8) { scale = 1e8; unit = '亿'; }
			else { scale = 1e4; unit = '万'; }
			// 一位小数的四舍五入用整数运算完成，避免 1.15 这类浮点尾数导致的错误舍入。
			const divisor = scale / 10;
			let scaled = Math.floor(n / divisor);
			const remainder = n - scaled * divisor;
			if (remainder * 2 >= divisor) scaled += 1;
			let mantissa = scaled / 10;
			if (unit === '万' && mantissa >= 1e4) { mantissa /= 1e4; unit = '亿'; }
			else if (unit === '亿' && mantissa >= 1e4) { mantissa /= 1e4; unit = '兆'; }
			const text = Number.isInteger(mantissa) ? String(mantissa) : mantissa.toFixed(1);
			return text + unit;
		}

		/** 三位分节后缀应为数值。 */
		const SUFFIX_SCALE = { K: 1e3, M: 1e6, B: 1e9 };

		/** 整体即为三位分节的参数值（如「12.3K」）。 */
		const COMPACT_PARAM_RE = /^(\d+(?:\.\d+)?)([KMB])$/;

		/**
		 * 解析三位分节字符串；不是三位分节时返回 null。
		 * @param {string} text
		 * @returns {number|null}
		 */
		function parseCompact(text) {
			const match = COMPACT_PARAM_RE.exec(String(text).trim());
			if (match === null) return null;
			return Number(match[1]) * SUFFIX_SCALE[match[2]];
		}

		/**
		 * 文本中内嵌的三位分节（模板键未覆盖时的补充匹配）：前后均不能是字母、数字、下划线、小数点或连字符，以免错误改写「GPT-4K」或「12.3KB」这类字面量（KB 的 K 后还有字母，自然不匹配）。
		 */
		const COMPACT_TEXT_RE = /(?<![A-Za-z0-9_.-])(\d+(?:\.\d+)?)([KMB])(?![\w.-])/g;

		/**
		 * 去掉三位一组的千分位逗号；只删除「数字,刚好三位数字」边界处的逗号，不影响普通标点。
		 * @param {string} text
		 * @returns {string}
		 */
		function ungroup(text) {
			return text.replace(/(\d),(?=\d{3}\b)/g, '$1');
		}

		// #endregion

		// #region token应为词元

		const CJK = '\\u4e00-\\u9fff';
		/** 表达「模型最小处理单位」的词（不含令牌等其它含义的用法）。 */
		const TOKEN_WORD = 'tokens?|Tokens?|tok|Tok';

		/**
		 * 把句子里的 token 类词替换成「词元」，TPS / tok/s 一并改写；汉字或数字相邻时去掉英文词一侧的多余空格（1234 tok应为1234词元）。
		 * @param {string} text
		 * @returns {string}
		 */
		function rewordTokens(text) {
			// 统计面板的「首 token 平均（TTFT）」完整说法是首个词元的平均用时。
			let out = text.replace(/首\s*token\s*平均/g, '首词元平均用时');
			out = out.replace(/(\d)\s*tok\/s\b/gi, '$1词元/秒');
			out = out.replace(/\btok\/s\b/gi, '词元/秒');
			out = out.replace(/(\d)\s*TPS\b/g, '$1词元/秒');
			out = out.replace(/\bTPS\b/g, '词元/秒');
			const left = new RegExp(`([${CJK}])\\s*(${TOKEN_WORD})\\s*(?=[${CJK}])`, 'g');
			const leftOnly = new RegExp(`([${CJK}])\\s*(${TOKEN_WORD})\\b`, 'g');
			const rightOnly = new RegExp(`\\b(${TOKEN_WORD})\\s*([${CJK}])`, 'g');
			const afterDigit = new RegExp(`(\\d)\\s*(${TOKEN_WORD})\\b`, 'g');
			const standalone = new RegExp(`\\b(${TOKEN_WORD})\\b`, 'g');
			out = out.replace(left, '$1词元');
			out = out.replace(leftOnly, '$1词元');
			out = out.replace(rightOnly, '词元$2');
			out = out.replace(afterDigit, '$1词元');
			out = out.replace(standalone, '词元');
			return out;
		}

		/**
		 * 翻译结果的整体后处理：内嵌三位分节应为四位分级；去除千分位逗号；token应为词元。
		 * @param {string} text
		 * @returns {string}
		 */
		function postProcess(text) {
			let out = text.replace(COMPACT_TEXT_RE, (whole, digits, suffix) => {
				const zh = zhCompact(Number(digits) * SUFFIX_SCALE[suffix]);
				return zh === null ? whole : zh;
			});
			out = ungroup(out);
			out = rewordTokens(out);
			return out;
		}

		// #endregion

		// #region LocaleRuntime 改写

		/** DSH 三位分节模板键：调用方已按 1e3 缩放。 */
		const THOUSAND_KEYS = new Set(['number.thousand', 'tokens.thousand']);
		/** DSH 三位分节模板键：调用方已按 1e6 缩放。 */
		const MILLION_KEYS = new Set(['number.million', 'tokens.million']);
		/** 千分位逗号的模板键。 */
		const GROUP_SEPARATOR_KEYS = new Set(['number.groupSeparator']);
		/**
		 * 计数模板键：同一组件的详情弹窗经它们传完整数字（与标签的缩放值同源）。
		 * 只有既出现缩放形式又出现完整形式的键才纳入对照。
		 */
		const EXACT_COUNT_KEYS = new Set(['message.turnUsage.count']);

		/**
		 * 从模板参数里取缩放值并还原为近似原始值。
		 * @param {object|null} params
		 * @param {number} multiplier 调用方的缩放倍数（1e3 / 1e6）。
		 * @returns {number|null}
		 */
		function scaledValue(params, multiplier) {
			const raw = params !== null && typeof params === 'object' ? params.value : undefined;
			if (raw === undefined || raw === null) return null;
			const num = typeof raw === 'number' ? raw : Number(raw);
			if (!Number.isFinite(num) || num < 0) return null;
			return num * multiplier;
		}

		/**
		 * 给定原始值，返回调用方（formatTokens）会送进三位分节模板的形态：先除以 1e3 / 1e6 并按与调用方一致的规则四舍五入，再加 K / M 后缀。
		 * 用于精确值对照的配对键，只处理一千及以上的值。
		 * @param {number} value
		 * @returns {string|null} 三位分节字符串（「12.3K」 / 「1.2M」）；无法处理时返回 null。
		 */
		function englishCompact(value) {
			if (typeof value !== 'number' || !Number.isFinite(value) || value < 1e3) return null;
			const scaled = (candidate) => (candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10));
			if (value < 1e6) return `${scaled(value / 1e3)}K`;
			return `${scaled(value / 1e6)}M`;
		}

		/**
		 * 由三位分节模板键的参数构造三位分节字符串（「12.3」+ K应为「12.3K」），用于配对查找。
		 * @param {object|null} params
		 * @param {'K'|'M'} suffix
		 * @returns {string|null}
		 */
		function compactKey(params, suffix) {
			const value = params !== null && typeof params === 'object' ? params.value : undefined;
			if (value === undefined || value === null) return null;
			return `${String(value)}${suffix}`;
		}

		/**
		 * 翻译函数 t 是 `(key, params) => this.translate(ns, key, params)`——每次调用都做属性查找，因此在实例上覆盖 translate 后，已存在的 t 也会使用新实现。
		 * @param {object} locale ctx.locale（LocaleRuntime 实例的服务代理，无 set 拦截，赋值会转发到实例本身）。
		 * @returns {() => void} 恢复函数。
		 */
		function wrapTranslate(locale) {
			const original = locale.translate.bind(locale);

			// 精确值对照的状态：待配对的三位分节字符串应为过期时刻；三位分节字符串应为完整数字。
			const PENDING_TTL_MS = 3e5;
			const CACHE_LIMIT = 64;
			const pendingByCompact = new Map();
			const exactByCompact = new Map();
			let disposed = false;
			let lastPulseAt = 0;

			/** 记下一次缩放查询，等待随后的完整数字前来配对。 */
			function armPending(ns, compact) {
				if (pendingByCompact.size > CACHE_LIMIT) pendingByCompact.clear();
				pendingByCompact.set(`${ns}|${compact}`, Date.now() + PENDING_TTL_MS);
			}

			/** 推进一次 locale 快照，让已渲染的标签随之重新渲染。 */
			function schedulePulse() {
				if (disposed) return;
				if (Date.now() - lastPulseAt < 1000) return;
				lastPulseAt = Date.now();
				const enqueue = typeof queueMicrotask === 'function' ? queueMicrotask : (fn) => setTimeout(fn, 0);
				enqueue(() => {
					if (disposed) return;
					try {
						locale.register('dsh-zh-number-format.pulse', 'zh', {})();
					} catch (_error) {
						// 上一次快照推进尚未结束，忽略。
					}
				});
			}

			/**
			 * 处理携带完整数字的计数模板键（如详情弹窗标题）：若该数字的三位分节字符串与最近一次缩放查询吻合，即建立精确值对照；显示会因此变化时推进一次 locale 快照。
			 */
			function noteExactCount(ns, params) {
				if (params === null || typeof params !== 'object') return;
				const count = params.count;
				if (typeof count !== 'string') return;
				const digits = /^\d+$/.exec(count.trim());
				if (digits === null) return;
				const value = Number(digits[0]);
				if (!Number.isFinite(value) || value < 1e3) return;
				const compact = englishCompact(value);
				if (compact === null) return;
				const traceKey = `${ns}|${compact}`;
				const expiresAt = pendingByCompact.get(traceKey);
				pendingByCompact.delete(traceKey);
				if (expiresAt === undefined || expiresAt < Date.now()) return;
				if (exactByCompact.size > CACHE_LIMIT) exactByCompact.clear();
				const previous = exactByCompact.get(traceKey);
				exactByCompact.set(traceKey, value);
				const before = previous === undefined ? zhCompact(parseCompact(compact)) : zhCompact(previous);
				if (before !== zhCompact(value)) schedulePulse();
			}

			const wrapper = function (ns, key, params) {
				if (THOUSAND_KEYS.has(key) || MILLION_KEYS.has(key)) {
					const isThousand = THOUSAND_KEYS.has(key);
					const compact = compactKey(params, isThousand ? 'K' : 'M');
					if (compact !== null) {
						const learned = exactByCompact.get(`${ns}|${compact}`);
						if (learned !== undefined) {
							const zh = zhCompact(learned);
							if (zh !== null) return zh;
						}
						armPending(ns, compact);
					}
					const value = scaledValue(params, isThousand ? 1e3 : 1e6);
					if (value !== null) {
						const zh = zhCompact(value);
						if (zh !== null) return zh;
					}
				} else if (GROUP_SEPARATOR_KEYS.has(key)) {
					return '';
				} else if (EXACT_COUNT_KEYS.has(key)) {
					noteExactCount(ns, params);
				}

				// 已是三位分节的字符串参数应为四位分级（如「{count} tok」的 count）。
				let nextParams = params;
				if (params !== null && typeof params === 'object') {
					let changed = false;
					const rebuilt = {};
					for (const [name, value] of Object.entries(params)) {
						if (typeof value === 'string') {
							const learned = exactByCompact.get(`${ns}|${value}`);
							const zh = zhCompact(learned ?? parseCompact(value));
							if (zh !== null) {
								rebuilt[name] = zh;
								changed = true;
								continue;
							}
						}
						rebuilt[name] = value;
					}
					if (changed) nextParams = rebuilt;
				}

				const result = original(ns, key, nextParams);
				return typeof result === 'string' ? postProcess(result) : result;
			};

			locale.translate = wrapper;
			return function restore() {
				disposed = true;
				// 删除实例上的覆盖属性，还原原型方法（代理读取每次返回新包装，无法用 === 比较，直接删除即可）。
				delete locale.translate;
			};
		}

		/**
		 * 去掉无参数 Number.prototype.toLocaleString 产生的千分位逗号。
		 * DSH 的账户余额用它格式化整数部分（en-US 式三位逗号）；带参数的调用一律使用原实现。
		 * @returns {() => void} 恢复函数。
		 */
		function patchUngroupedNumbers() {
			const proto = Number.prototype;
			const original = proto.toLocaleString;
			const patched = function (...args) {
				if (args.length === 0) {
					const value = Number(this);
					if (Number.isFinite(value)) return String(value);
				}
				return Reflect.apply(original, this, args);
			};
			proto.toLocaleString = patched;
			return function restore() {
				if (proto.toLocaleString === patched) proto.toLocaleString = original;
			};
		}

		// #endregion

		return {
			inject: ['locale'],
			apply(ctx) {
				const locale = ctx.locale;
				ctx.effect(() => wrapTranslate(locale), 'dsh-zh-number-format: 中文计数与词元改写');
				ctx.effect(() => patchUngroupedNumbers(), 'dsh-zh-number-format: 去除千分位逗号');
				// 注册一个空字典推进 locale 快照 revision，让已渲染的文本立即按新规则重新渲染。
				ctx.effect(() => locale.register('dsh-zh-number-format.refresh', 'zh', {}), 'dsh-zh-number-format: 刷新界面文本');
			},
		};
	},
});
