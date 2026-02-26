import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

function Panel({ title, children }) {
	return (
		<View style={styles.panel}>
			<Text style={styles.panelTitle}>{title}</Text>
			<View style={styles.panelBody}>{children}</View>
		</View>
	);
}

export default function App() {
	return (
		<View style={styles.screen}>
			<Text style={styles.headline}>InfoTV</Text>
			<View style={styles.grid}>
				<Panel title="Current Weather">
					<Text style={styles.primaryValue}>72°F</Text>
					<Text style={styles.subtleText}>Clear skies in New York, NY</Text>
				</Panel>
				<Panel title="Top News">
					<Text style={styles.newsItem}>1. Placeholder headline for breaking story</Text>
					<Text style={styles.newsItem}>2. Placeholder headline for local update</Text>
					<Text style={styles.newsItem}>3. Placeholder headline for market recap</Text>
				</Panel>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: {
		flex: 1,
		paddingHorizontal: 48,
		paddingVertical: 36,
		backgroundColor: '#08131c',
	},
	headline: {
		color: '#e7f4ff',
		fontSize: 56,
		fontWeight: '800',
		letterSpacing: 0.8,
	},
	grid: {
		marginTop: 24,
		flex: 1,
		flexDirection: 'row',
		gap: 24,
	},
	panel: {
		flex: 1,
		borderRadius: 18,
		backgroundColor: '#122330',
		borderWidth: 1,
		borderColor: '#244356',
		overflow: 'hidden',
	},
	panelTitle: {
		fontSize: 30,
		fontWeight: '700',
		color: '#d4ebff',
		paddingHorizontal: 24,
		paddingTop: 20,
	},
	panelBody: {
		padding: 24,
		gap: 14,
	},
	primaryValue: {
		fontSize: 72,
		fontWeight: '800',
		color: '#9bd5ff',
	},
	subtleText: {
		color: '#c3d9e7',
		fontSize: 24,
	},
	newsItem: {
		color: '#d7ebf8',
		fontSize: 30,
		lineHeight: 42,
	},
});
