import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import AudioPlayer from 'react-h5-audio-player';

const AQI_EMBED_LAT = 49.1;
const AQI_EMBED_LON = 7.3;
const AQI_EMBED_ZOOM = 4;

const TEMPERATURE_EMBED_LAYER = 'temperature-2m';
const TEMPERATURE_EMBED_WIND = 'normal';
const TEMPERATURE_EMBED_HOUR_LOCAL = 16;
const TEMPERATURE_EMBED_URL = `https://embed.ventusky.com/?p=${AQI_EMBED_LAT};${AQI_EMBED_LON};${AQI_EMBED_ZOOM}&l=${TEMPERATURE_EMBED_LAYER}&w=${TEMPERATURE_EMBED_WIND}`;

const AQI_EMBED_LAYER = 'aqi';
const AQI_EMBED_WIND = 'off';
const AQI_EMBED_REFRESH_INTERVAL_MINUTES = 15;
const AQI_EMBED_REFRESH_INTERVAL_MS = AQI_EMBED_REFRESH_INTERVAL_MINUTES * 60 * 1000;
const AQI_EMBED_URL = `https://embed.ventusky.com/?p=${AQI_EMBED_LAT};${AQI_EMBED_LON};${AQI_EMBED_ZOOM}&l=${AQI_EMBED_LAYER}&w=${AQI_EMBED_WIND}`;
const EXTRA_MAP_LAYER = 'radar';
const EXTRA_MAP_WIND = 'off';
const EXTRA_MAP_URL = `https://embed.ventusky.com/?p=${AQI_EMBED_LAT};${AQI_EMBED_LON};${AQI_EMBED_ZOOM}&l=${EXTRA_MAP_LAYER}&w=${EXTRA_MAP_WIND}`;
const ZURICH_TEMPERATURE_LAT = 47.3769;
const ZURICH_TEMPERATURE_LON = 8.5417;
const ZURICH_TEMPERATURE_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ZURICH_TEMPERATURE_API_URL = `https://api.open-meteo.com/v1/forecast?latitude=${ZURICH_TEMPERATURE_LAT}&longitude=${ZURICH_TEMPERATURE_LON}&current=temperature_2m&temperature_unit=celsius&timezone=Europe%2FZurich`;

const SRF_NEWS_RSS_URL = 'https://www.srf.ch/news/bnf/rss/1646';
const NEWS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const NEWS_SWISS_MAX_ITEMS = 3;
const NEWS_INTERNATIONAL_MAX_ITEMS = 7;
const NEWS_TOTAL_ITEMS = NEWS_SWISS_MAX_ITEMS + NEWS_INTERNATIONAL_MAX_ITEMS;
const NEWS_SCROLL_VISIBLE_ITEMS = 6;
const NEWS_SCROLL_SECONDS_PER_ITEM = 8;
const SRF_SWISS_LINK_PATTERN = /\/news\/schweiz(\/|$)/;
const SRF_INTERNATIONAL_LINK_PATTERN = /\/news\/international(\/|$)/;

const RADIO_METADATA_REFRESH_INTERVAL_MS = 30000;
const RADIO_METADATA_MAX_BLOCKS = 4;
const RADIO_METADATA_SCAN_MAX_BYTES = 512 * 1024;

const RADIO_STATIONS = [
	{
		id: 'chill',
		label: 'CDM Chillout',
		url: 'https://radio4.cdm-radio.com:18020/stream-mp3-Chill',
		metadataUrl: 'https://radio4.cdm-radio.com:18020/stream-mp3-Chill',
	},
	{
		id: 'srf4news',
		label: 'SRF 4 News',
		url: 'https://stream.srg-ssr.ch/srgssr/srf4news/mp3/128',
		metadataUrl: 'https://livestreaming-node-4.srg-ssr.ch/srgssr/srf4news/mp3/128',
	},
];

function formatVentuskyUtcTimeParam(date) {
	const year = date.getUTCFullYear();
	const month = String(date.getUTCMonth() + 1).padStart(2, '0');
	const day = String(date.getUTCDate()).padStart(2, '0');
	const hour = String(date.getUTCHours()).padStart(2, '0');
	return `${year}${month}${day}/${hour}`;
}

function getTodayTemperatureEmbedTimeParam(now = new Date()) {
	const todayAtLocalHour = new Date(
		now.getFullYear(),
		now.getMonth(),
		now.getDate(),
		TEMPERATURE_EMBED_HOUR_LOCAL,
		0,
		0,
		0,
	);
	return formatVentuskyUtcTimeParam(todayAtLocalHour);
}

function sleepWithAbort(ms, signal) {
	return new Promise(resolve => {
		if (signal.aborted) {
			resolve();
			return;
		}

		const timeout = setTimeout(() => {
			signal.removeEventListener('abort', onAbort);
			resolve();
		}, ms);

		const onAbort = () => {
			clearTimeout(timeout);
			signal.removeEventListener('abort', onAbort);
			resolve();
		};

		signal.addEventListener('abort', onAbort, { once: true });
	});
}

function concatChunks(chunks, length) {
	const joined = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) {
		joined.set(chunk, offset);
		offset += chunk.length;
	}
	return joined;
}

function decodeMetadata(bytes) {
	const utf8Decoder = new TextDecoder('utf-8', { fatal: false });
	const latinDecoder = new TextDecoder('iso-8859-1', { fatal: false });
	const utf8Text = utf8Decoder.decode(bytes).replace(/\0/g, '').trim();
	if (utf8Text.includes("StreamTitle='")) {
		return utf8Text;
	}
	return latinDecoder.decode(bytes).replace(/\0/g, '').trim();
}

function extractStreamTitle(metadataText) {
	const match = metadataText.match(/StreamTitle='([^']*)';?/i);
	if (!match) {
		return '';
	}
	return match[1].replace(/\0/g, '').replace(/\s+/g, ' ').trim();
}

function splitNowPlaying(streamTitle) {
	if (!streamTitle) {
		return { artist: '', title: '' };
	}
	const separatorIndex = streamTitle.indexOf(' - ');
	if (separatorIndex > 0) {
		return {
			artist: streamTitle.slice(0, separatorIndex).trim(),
			title: streamTitle.slice(separatorIndex + 3).trim(),
		};
	}
	return { artist: '', title: streamTitle };
}

function getNewsItemKey(item, fallback = '') {
	return item.guid || item.link || item.title || fallback;
}

function sanitizeNewsTitle(title) {
	return (title ?? '').replace(/^\-\s+/, '').trim();
}

function parseNewsFeed(xmlText) {
	const parser = new DOMParser();
	const xml = parser.parseFromString(xmlText, 'application/xml');
	const parserError = xml.querySelector('parsererror');
	if (parserError) {
		throw new Error('Failed to parse SRF RSS feed');
	}

	const allItems = Array.from(xml.querySelectorAll('channel > item'))
		.map((itemNode, index) => {
			const title = sanitizeNewsTitle(itemNode.querySelector('title')?.textContent ?? '');
			const link = itemNode.querySelector('link')?.textContent?.trim() ?? '';
			const guid = itemNode.querySelector('guid')?.textContent?.trim() ?? `${index}-${title}`;
			const pubDate = itemNode.querySelector('pubDate')?.textContent?.trim() ?? '';
			const timestamp = Date.parse(pubDate);
			return {
				title,
				link,
				guid,
				pubDate,
				timestamp: Number.isFinite(timestamp) ? timestamp : 0,
			};
		})
		.filter(item => item.title);

	const sortByTimestampDesc = (first, second) => second.timestamp - first.timestamp;
	const swissItems = allItems
		.filter(item => SRF_SWISS_LINK_PATTERN.test(item.link))
		.sort(sortByTimestampDesc)
		.slice(0, NEWS_SWISS_MAX_ITEMS);
	const internationalItems = allItems
		.filter(item => SRF_INTERNATIONAL_LINK_PATTERN.test(item.link))
		.sort(sortByTimestampDesc)
		.slice(0, NEWS_INTERNATIONAL_MAX_ITEMS);

	const selectedByKey = new Map();
	for (const item of [...swissItems, ...internationalItems]) {
		selectedByKey.set(getNewsItemKey(item), item);
	}

	const items = Array.from(selectedByKey.values()).sort(sortByTimestampDesc).slice(0, NEWS_TOTAL_ITEMS);

	if (items.length < NEWS_TOTAL_ITEMS) {
		const selectedKeys = new Set(items.map(item => getNewsItemKey(item)));
		const fallbackItems = allItems
			.filter(item => !selectedKeys.has(getNewsItemKey(item)))
			.sort(sortByTimestampDesc)
			.slice(0, NEWS_TOTAL_ITEMS - items.length);
		items.push(...fallbackItems);
		items.sort(sortByTimestampDesc);
	}

	return {
		feedTitle: 'SRF Schweiz + International',
		items: items.map(({ timestamp, ...item }) => item),
	};
}

async function readIcyTitleBySignature(reader) {
	const latinDecoder = new TextDecoder('iso-8859-1', { fatal: false });
	let totalRead = 0;
	let rollingText = '';

	while (totalRead < RADIO_METADATA_SCAN_MAX_BYTES) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}

		totalRead += value.length;
		rollingText += latinDecoder.decode(value, { stream: true });
		if (rollingText.length > 8192) {
			rollingText = rollingText.slice(-8192);
		}

		const streamTitle = extractStreamTitle(rollingText);
		if (streamTitle) {
			return streamTitle;
		}
	}

	return '';
}

async function readIcyTitleOnce(streamUrl, signal) {
	const response = await fetch(streamUrl, {
		headers: {
			'Icy-MetaData': '1',
		},
		cache: 'no-store',
		signal,
	});

	const metaint = Number.parseInt(response.headers.get('icy-metaint') ?? '', 10);
	if (!response.body) {
		throw new Error('Stream body is not readable');
	}

	const reader = response.body.getReader();
	if (!Number.isFinite(metaint) || metaint <= 0) {
		try {
			return await readIcyTitleBySignature(reader);
		} finally {
			try {
				await reader.cancel();
			} catch {}
		}
	}

	let bytesUntilMeta = metaint;
	let metadataLength = null;
	let metadataRead = 0;
	let metadataChunks = [];
	let metadataBlocksSeen = 0;

	while (true) {
		const { value, done } = await reader.read();
		if (done) {
			break;
		}

		let offset = 0;
		while (offset < value.length) {
			if (bytesUntilMeta > 0) {
				const skipCount = Math.min(bytesUntilMeta, value.length - offset);
				offset += skipCount;
				bytesUntilMeta -= skipCount;
				continue;
			}

			if (metadataLength === null) {
				metadataLength = value[offset] * 16;
				offset += 1;
				metadataRead = 0;
				metadataChunks = [];

				if (metadataLength === 0) {
					metadataBlocksSeen += 1;
					if (metadataBlocksSeen >= RADIO_METADATA_MAX_BLOCKS) {
						try {
							await reader.cancel();
						} catch {}
						return '';
					}
					bytesUntilMeta = metaint;
					metadataLength = null;
				}
				continue;
			}

			const remaining = metadataLength - metadataRead;
			const take = Math.min(remaining, value.length - offset);
			if (take > 0) {
				metadataChunks.push(value.slice(offset, offset + take));
				metadataRead += take;
				offset += take;
			}

			if (metadataRead === metadataLength) {
				metadataBlocksSeen += 1;
				const metadataBytes = concatChunks(metadataChunks, metadataLength);
				const metadataText = decodeMetadata(metadataBytes);
				const streamTitle = extractStreamTitle(metadataText);
				if (streamTitle) {
					try {
						await reader.cancel();
					} catch {}
					return streamTitle;
				}

				if (metadataBlocksSeen >= RADIO_METADATA_MAX_BLOCKS) {
					try {
						await reader.cancel();
					} catch {}
					return '';
				}

				bytesUntilMeta = metaint;
				metadataLength = null;
				metadataRead = 0;
				metadataChunks = [];
			}
		}
	}

	try {
		await reader.cancel();
	} catch {}
	return '';
}

const ventuskyOuterStyle = {
	display: 'block',
	position: 'relative',
	width: '100%',
	height: '100%',
	margin: 0,
	padding: 0,
	border: 0,
};

const ventuskyInnerStyle = {
	display: 'block',
	position: 'relative',
	width: '100%',
	height: '100%',
	margin: 0,
	padding: 0,
	border: 0,
	boxSizing: 'content-box',
};

const ventuskyIframeStyle = {
	display: 'block',
	position: 'absolute',
	left: 0,
	top: 0,
	width: '100%',
	height: '100%',
	margin: 0,
	padding: 0,
	border: 0,
};

const stationButtonsRowStyle = {
	display: 'flex',
	flexDirection: 'row',
	gap: 8,
	marginBottom: 4,
};

const stationButtonBaseStyle = {
	appearance: 'none',
	border: '1px solid #3e6278',
	fontWeight: 700,
	cursor: 'pointer',
};

const audioPlayerWrapStyle = {
	marginTop: 'auto',
};

function Panel({ children, ui, bodyStyle }) {
	return (
		<View style={[styles.panel, { borderRadius: ui.panelRadius }]}>
			<View style={[styles.panelBody, { padding: ui.panelPadding, gap: ui.bodyGap }, bodyStyle]}>{children}</View>
		</View>
	);
}

export default function App() {
	const { width, height } = useWindowDimensions();
	const [mapEmbedReloadToken, setMapEmbedReloadToken] = React.useState(0);
	const [selectedStationId, setSelectedStationId] = React.useState(RADIO_STATIONS[0].id);
	const [clockNow, setClockNow] = React.useState(() => new Date());
	const [radioNowPlaying, setRadioNowPlaying] = React.useState({
		status: 'idle',
		artist: '',
		title: '',
	});
	const [newsState, setNewsState] = React.useState({
		status: 'loading',
		feedTitle: 'SRF Schweiz + International',
		updatedAt: '',
		items: [],
	});
	const [zurichTemperatureState, setZurichTemperatureState] = React.useState({
		status: 'loading',
		value: null,
	});

	React.useEffect(() => {
		if (!Number.isFinite(AQI_EMBED_REFRESH_INTERVAL_MS) || AQI_EMBED_REFRESH_INTERVAL_MS <= 0) {
			return undefined;
		}

		const refreshTimer = setInterval(() => {
			setMapEmbedReloadToken(current => current + 1);
		}, AQI_EMBED_REFRESH_INTERVAL_MS);

		return () => clearInterval(refreshTimer);
	}, []);

	React.useEffect(() => {
		const clockTimer = setInterval(() => {
			setClockNow(new Date());
		}, 1000);
		return () => clearInterval(clockTimer);
	}, []);

	const temperatureEmbedSrc = React.useMemo(() => {
		const timeParam = getTodayTemperatureEmbedTimeParam();
		return `${TEMPERATURE_EMBED_URL}&t=${timeParam}&refresh=${mapEmbedReloadToken}`;
	}, [mapEmbedReloadToken]);
	const aqiEmbedSrc = React.useMemo(() => `${AQI_EMBED_URL}&refresh=${mapEmbedReloadToken}`, [mapEmbedReloadToken]);
	const extraMapSrc = React.useMemo(() => `${EXTRA_MAP_URL}&refresh=${mapEmbedReloadToken}`, [mapEmbedReloadToken]);
	const selectedStation = RADIO_STATIONS.find(station => station.id === selectedStationId) ?? RADIO_STATIONS[0];
	const selectedStationMetadataUrl = selectedStation.metadataUrl ?? selectedStation.url;

	React.useEffect(() => {
		const metadataController = new AbortController();
		let latestTitle = '';

		setRadioNowPlaying({
			status: 'loading',
			artist: '',
			title: '',
		});

		const pollNowPlaying = async () => {
			while (!metadataController.signal.aborted) {
				try {
					const streamTitle = await readIcyTitleOnce(selectedStationMetadataUrl, metadataController.signal);
					if (metadataController.signal.aborted) {
						return;
					}

					if (streamTitle) {
						latestTitle = streamTitle;
						const parts = splitNowPlaying(streamTitle);
						setRadioNowPlaying({
							status: 'live',
							artist: parts.artist,
							title: parts.title,
						});
					} else if (!latestTitle) {
						setRadioNowPlaying({
							status: 'unavailable',
							artist: '',
							title: '',
						});
					}
				} catch (error) {
					if (!metadataController.signal.aborted && !latestTitle) {
						setRadioNowPlaying({
							status: 'unavailable',
							artist: '',
							title: '',
						});
					}
				}

				await sleepWithAbort(RADIO_METADATA_REFRESH_INTERVAL_MS, metadataController.signal);
			}
		};

		pollNowPlaying();
		return () => metadataController.abort();
	}, [selectedStationMetadataUrl]);

	React.useEffect(() => {
		const newsController = new AbortController();

		const refreshNews = async () => {
			try {
				const response = await fetch(SRF_NEWS_RSS_URL, {
					cache: 'no-store',
					signal: newsController.signal,
				});
				if (!response.ok) {
					throw new Error(`Unexpected RSS response: ${response.status}`);
				}

				const rssText = await response.text();
				const parsedFeed = parseNewsFeed(rssText);
				if (newsController.signal.aborted) {
					return;
				}

				setNewsState({
					status: 'live',
					feedTitle: parsedFeed.feedTitle,
					updatedAt: new Date().toISOString(),
					items: parsedFeed.items,
				});
			} catch (error) {
				if (!newsController.signal.aborted) {
					setNewsState(previous => ({
						...previous,
						status: 'error',
					}));
				}
			}
		};

		refreshNews();
		const refreshTimer = setInterval(refreshNews, NEWS_REFRESH_INTERVAL_MS);
		return () => {
			newsController.abort();
			clearInterval(refreshTimer);
		};
	}, []);

	React.useEffect(() => {
		const temperatureController = new AbortController();

		const refreshTemperature = async () => {
			try {
				const response = await fetch(ZURICH_TEMPERATURE_API_URL, {
					cache: 'no-store',
					signal: temperatureController.signal,
				});
				if (!response.ok) {
					throw new Error(`Unexpected Open-Meteo response: ${response.status}`);
				}

				const payload = await response.json();
				const currentTemperature = Number(payload?.current?.temperature_2m);
				if (!Number.isFinite(currentTemperature)) {
					throw new Error('Open-Meteo current temperature is missing');
				}
				if (temperatureController.signal.aborted) {
					return;
				}

				setZurichTemperatureState({
					status: 'live',
					value: currentTemperature,
				});
			} catch (error) {
				if (!temperatureController.signal.aborted) {
					setZurichTemperatureState(previous => ({
						status: 'error',
						value: previous.value,
					}));
				}
			}
		};

		refreshTemperature();
		const refreshTimer = setInterval(refreshTemperature, ZURICH_TEMPERATURE_REFRESH_INTERVAL_MS);
		return () => {
			temperatureController.abort();
			clearInterval(refreshTimer);
		};
	}, []);

	const ui = React.useMemo(() => {
		const minSide = Math.max(360, Math.min(width, height));
		const scale = Math.max(0.55, Math.min(minSide / 1080, 1.6));

		return {
			outerPadding: 4,
			gridGap: 4,
			panelPadding: Math.max(10, Math.round(18 * scale)),
			panelRadius: Math.max(4, Math.round(8 * scale)),
			bodyGap: Math.max(8, Math.round(12 * scale)),
			stationButtonTextSize: Math.max(12, Math.round(16 * scale)),
			newsSize: Math.max(14, Math.round(22 * scale)),
			radioSize: Math.max(14, Math.round(21 * scale)),
			clockTimeSize: Math.max(62, Math.round(108 * scale)),
			clockTempSize: Math.max(27, Math.round(36 * scale)),
			stationButtonPadX: Math.max(10, Math.round(12 * scale)),
			stationButtonPadY: Math.max(8, Math.round(10 * scale)),
			innerRadius: Math.max(3, Math.round(6 * scale)),
		};
	}, [width, height]);

	const newsTickerVisibleItems = Math.min(NEWS_SCROLL_VISIBLE_ITEMS, Math.max(newsState.items.length, 1));
	const newsTickerDurationSeconds = Math.max(18, Math.round(newsState.items.length * NEWS_SCROLL_SECONDS_PER_ITEM));
	const newsTickerLoopItems = newsState.items.length > 1 ? [...newsState.items, ...newsState.items] : newsState.items;
	const hasAnimatedNewsTicker = newsState.items.length > 1;
	const clockTimeText = clockNow.toLocaleTimeString('de-CH', {
		hour: '2-digit',
		minute: '2-digit',
		hour12: false,
	});
	const clockTemperatureText = Number.isFinite(zurichTemperatureState.value)
		? `Zurich: ${zurichTemperatureState.value.toFixed(1)}C`
		: zurichTemperatureState.status === 'error'
			? 'Zurich: n/a'
			: 'Zurich: ...';

	return (
		<View style={[styles.screen, { padding: ui.outerPadding }]}>
			<View style={[styles.grid, { gap: ui.gridGap }]}>
				<View style={[styles.row, { gap: ui.gridGap }]}>
					<Panel ui={ui} bodyStyle={styles.mapPanelBody}>
						<View style={[styles.embedFrame, { borderRadius: ui.innerRadius }]}>
							<div style={ventuskyOuterStyle}>
								<div style={ventuskyInnerStyle}>
									<iframe
										key={`temperature-${mapEmbedReloadToken}`}
										src={temperatureEmbedSrc}
										style={ventuskyIframeStyle}
										loading="lazy"
										title="Ventusky Temperature Map"
									/>
								</div>
							</div>
						</View>
					</Panel>

					<Panel ui={ui} bodyStyle={styles.mapPanelBody}>
						<View style={[styles.embedFrame, { borderRadius: ui.innerRadius }]}>
							<div style={ventuskyOuterStyle}>
								<div style={ventuskyInnerStyle}>
									<iframe
										key={`aqi-${mapEmbedReloadToken}`}
										src={aqiEmbedSrc}
										style={ventuskyIframeStyle}
										loading="lazy"
										title="Ventusky AQI Map"
									/>
								</div>
							</div>
						</View>
					</Panel>
				</View>

				<View style={[styles.row, { gap: ui.gridGap }]}>
					<Panel ui={ui} bodyStyle={styles.mapPanelBody}>
						<View style={[styles.embedFrame, { borderRadius: ui.innerRadius }]}>
							<div style={ventuskyOuterStyle}>
								<div style={ventuskyInnerStyle}>
									<iframe
										key={`extra-${mapEmbedReloadToken}`}
										src={extraMapSrc}
										style={ventuskyIframeStyle}
										loading="lazy"
										title="Ventusky Extra Map"
									/>
								</div>
							</div>
						</View>
					</Panel>

					<Panel ui={ui}>
						<View style={styles.mergedLowerRightPanel}>
							<View style={styles.mergedLowerRightSection}>
								<View style={styles.newsPanel}>
									<Text
										style={[
											styles.newsFeedTitle,
											{ fontSize: Math.max(13, Math.round(ui.newsSize * 0.72)) },
										]}
									>
										{newsState.feedTitle}
									</Text>
									{newsState.status === 'loading' ? (
										<Text
											style={[
												styles.newsMuted,
												{ fontSize: Math.max(12, Math.round(ui.newsSize * 0.72)) },
											]}
										>
											Lade Schlagzeilen...
										</Text>
									) : null}
									{newsState.status === 'error' ? (
										<Text
											style={[
												styles.newsMuted,
												{ fontSize: Math.max(12, Math.round(ui.newsSize * 0.72)) },
											]}
										>
											News-Feed momentan nicht verfuegbar
										</Text>
									) : null}

									{newsState.status === 'live' && newsState.items.length > 0 ? (
										<div
											className="newsTickerViewport"
											style={{ borderRadius: `${ui.innerRadius}px` }}
										>
											<div
												className={`newsTickerTrack${hasAnimatedNewsTicker ? ' is-animated' : ''}`}
												style={{
													'--ticker-loop-count': `${newsTickerLoopItems.length}`,
													'--ticker-visible-items': `${newsTickerVisibleItems}`,
													'--ticker-duration': `${newsTickerDurationSeconds}s`,
													fontSize: `${ui.newsSize}px`,
													lineHeight: `${Math.round(ui.newsSize * 1.2)}px`,
												}}
											>
												{newsTickerLoopItems.map((item, index) => {
													return (
														<div
															key={`${getNewsItemKey(item, `headline-${index}`)}-${index}`}
															className="newsTickerItem"
															title={item.title}
														>
															{item.title}
														</div>
													);
												})}
											</div>
										</div>
									) : null}
									{newsState.status === 'live' && newsState.items.length === 0 ? (
										<Text
											style={[
												styles.newsMuted,
												{ fontSize: Math.max(12, Math.round(ui.newsSize * 0.72)) },
											]}
										>
											Keine Schlagzeilen gefunden
										</Text>
									) : null}

									{newsState.status === 'live' && newsState.updatedAt ? (
										<Text
											style={[
												styles.newsUpdatedAt,
												{ fontSize: Math.max(11, Math.round(ui.newsSize * 0.62)) },
											]}
										>
											Aktualisiert:{' '}
											{new Date(newsState.updatedAt).toLocaleTimeString('de-CH', {
												hour: '2-digit',
												minute: '2-digit',
											})}
										</Text>
									) : null}
								</View>
							</View>

							<View style={styles.mergedLowerRightSectionBottom}>
								<View style={[styles.lowerRightBottomSplit, { gap: ui.bodyGap }]}>
									<View style={styles.radioPane}>
										<View style={styles.radioPanel}>
											<div style={stationButtonsRowStyle}>
												{RADIO_STATIONS.map(station => {
													const isActive = station.id === selectedStation.id;
													return (
														<button
															key={station.id}
															type="button"
															onClick={() => setSelectedStationId(station.id)}
															style={{
																...stationButtonBaseStyle,
																borderRadius: ui.innerRadius,
																padding: `${ui.stationButtonPadY}px ${ui.stationButtonPadX}px`,
																fontSize: `${ui.stationButtonTextSize}px`,
																backgroundColor: isActive ? '#2c5875' : '#183244',
																borderColor: isActive ? '#79b7df' : '#3e6278',
																color: isActive ? '#ecf8ff' : '#cfe3f1',
															}}
														>
															{station.label}
														</button>
													);
												})}
											</div>

											<Text style={[styles.radioLine, { fontSize: ui.radioSize }]}>
												Station: {selectedStation.label}
											</Text>
											{radioNowPlaying.status === 'live' && radioNowPlaying.artist ? (
												<Text
													style={[
														styles.radioMetaLine,
														{ fontSize: Math.max(12, Math.round(ui.radioSize * 0.82)) },
													]}
												>
													Now Playing: {radioNowPlaying.artist} - {radioNowPlaying.title}
												</Text>
											) : null}
											{radioNowPlaying.status === 'live' && !radioNowPlaying.artist ? (
												<Text
													style={[
														styles.radioMetaLine,
														{ fontSize: Math.max(12, Math.round(ui.radioSize * 0.82)) },
													]}
												>
													Now Playing: {radioNowPlaying.title}
												</Text>
											) : null}
											{radioNowPlaying.status === 'loading' ? (
												<Text
													style={[
														styles.radioMetaMuted,
														{ fontSize: Math.max(12, Math.round(ui.radioSize * 0.78)) },
													]}
												>
													Loading metadata...
												</Text>
											) : null}
											{radioNowPlaying.status === 'unavailable' ? (
												<Text
													style={[
														styles.radioMetaMuted,
														{ fontSize: Math.max(12, Math.round(ui.radioSize * 0.78)) },
													]}
												>
													Now playing metadata unavailable
												</Text>
											) : null}

											<div style={audioPlayerWrapStyle}>
												<AudioPlayer
													src={selectedStation.url}
													autoPlayAfterSrcChange={false}
													showJumpControls={false}
													customAdditionalControls={[]}
													customVolumeControls={['VOLUME']}
													layout="stacked-reverse"
												/>
											</div>
										</View>
									</View>

									<View style={[styles.clockPanel, { borderRadius: ui.innerRadius }]}>
										<Text style={[styles.clockTime, { fontSize: ui.clockTimeSize }]}>
											{clockTimeText}
										</Text>
										<Text style={[styles.clockDate, { fontSize: ui.clockTempSize }]}>
											{clockTemperatureText}
										</Text>
									</View>
								</View>
							</View>
						</View>
					</Panel>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		width: '100%',
		height: '100%',
		backgroundColor: '#08131c',
	},
	grid: {
		flex: 1,
		minHeight: 0,
	},
	row: {
		flex: 1,
		minHeight: 0,
		flexDirection: 'row',
	},
	panel: {
		flex: 1,
		minWidth: 0,
		minHeight: 0,
		borderRadius: 18,
		backgroundColor: '#122330',
		borderWidth: 1,
		borderColor: '#244356',
		overflow: 'hidden',
	},
	panelBody: {
		flex: 1,
		minHeight: 0,
	},
	mapPanelBody: {
		padding: 0,
		gap: 0,
	},
	embedFrame: {
		flex: 1,
		minHeight: 0,
		overflow: 'hidden',
	},
	newsPanel: {
		flex: 1,
		minHeight: 0,
		gap: 6,
	},
	newsFeedTitle: {
		color: '#9ac6df',
		fontWeight: '700',
	},
	newsMuted: {
		color: '#8eaec2',
	},
	newsUpdatedAt: {
		color: '#8aa8bc',
		marginTop: 'auto',
	},
	mergedLowerRightPanel: {
		flex: 1,
		minHeight: 0,
	},
	mergedLowerRightSection: {
		flex: 11,
		minHeight: 0,
	},
	mergedLowerRightSectionBottom: {
		flex: 9,
		minHeight: 0,
		marginTop: 12,
		paddingTop: 12,
		borderTopWidth: 1,
		borderTopColor: '#2d4b5d',
	},
	lowerRightBottomSplit: {
		flex: 1,
		minHeight: 0,
		flexDirection: 'row',
	},
	radioPane: {
		flex: 3,
		minWidth: 0,
		minHeight: 0,
	},
	radioPanel: {
		flex: 1,
		minHeight: 0,
		gap: 10,
	},
	radioLine: {
		color: '#d7ebf8',
	},
	radioMetaLine: {
		color: '#bad9ec',
	},
	radioMetaMuted: {
		color: '#8eaec2',
	},
	clockPanel: {
		flex: 2,
		minWidth: 0,
		minHeight: 0,
		backgroundColor: '#0f2432',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 4,
	},
	clockTime: {
		color: '#ecf8ff',
		fontWeight: '700',
		fontVariant: ['tabular-nums'],
		textAlign: 'center',
	},
	clockDate: {
		color: '#9ac6df',
		fontWeight: '600',
		marginTop: 1,
	},
});
