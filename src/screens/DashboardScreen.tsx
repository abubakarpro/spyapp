import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Image, ActivityIndicator, SafeAreaView } from 'react-native';
import axios from 'axios';

export const DashboardScreen = () => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    axios.get('https://jsonplaceholder.typicode.com/photos?_limit=15')
      .then(res => setItems(res.data))
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Enterprise Suite Dashboard</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="large" color="#0066cc" style={styles.loader} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Image source={{ uri: item.thumbnailUrl }} style={styles.thumb} />
              <View style={styles.info}>
                <Text numberOfLines={2} style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.sub}>Sync Status: Secured • Active</Text>
              </View>
            </View>
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderColor: '#e1e4e8' },
  title: { fontSize: 18, fontWeight: '700', color: '#24292e' },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  list: { padding: 16 },
  card: { flexDirection: 'row', backgroundColor: '#fff', marginBottom: 12, borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e1e4e8' },
  thumb: { width: 80, height: 80, backgroundColor: '#e1e4e8' },
  info: { flex: 1, padding: 12, justifyContent: 'center' },
  cardTitle: { fontSize: 14, fontWeight: '600', color: '#24292e', marginBottom: 4 },
  sub: { fontSize: 12, color: '#586069' },
});