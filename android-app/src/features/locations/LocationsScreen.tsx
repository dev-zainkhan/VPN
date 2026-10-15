import { Feather } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../../components/Button';
import { Header } from '../../components/Header';
import { LocationRow } from '../../components/LocationRow';
import { Screen } from '../../components/Screen';
import { colors } from '../../theme/colors';
import { FASTEST, type Location } from '../../types';

type LocationsScreenProps = {
  locations: Location[];
  loading: boolean;
  selected: Location;
  onBack: () => void;
  onSelect: (location: Location) => void;
};

export function LocationsScreen({ locations, loading, selected, onBack, onSelect }: LocationsScreenProps) {
  const [search, setSearch] = useState('');
  const filteredLocations = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return locations;
    return locations.filter((location) =>
      `${location.country} ${location.city} ${location.code}`.toLowerCase().includes(query),
    );
  }, [search, locations]);

  return (
    <Screen scroll contentStyle={styles.content}>
      <Header title="Choose location" onBack={onBack} />
      <View style={styles.searchBox}>
        <Feather name="search" size={19} color={colors.secondary} />
        <TextInput
          accessibilityLabel="Search country or city"
          autoCapitalize="none"
          onChangeText={setSearch}
          placeholder="Search country or city"
          placeholderTextColor={colors.muted}
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
        {search.length > 0 && (
          <Pressable accessibilityLabel="Clear search" onPress={() => setSearch('')}>
            <Feather name="x-circle" size={18} color={colors.secondary} />
          </Pressable>
        )}
      </View>

      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected: selected.id === 'FAST' }}
        onPress={() => onSelect(FASTEST)}
        style={({ pressed }) => [styles.fastestCard, selected.id === 'FAST' && styles.fastestSelected, pressed && styles.pressed]}
      >
        <View style={styles.fastestIcon}>
          <Feather name="zap" size={21} color={colors.black} />
        </View>
        <View style={styles.fastestCopy}>
          <Text style={styles.fastestTitle}>Fastest location</Text>
          <Text style={styles.fastestDetail}>Picks the best server for you</Text>
        </View>
        <Feather
          name={selected.id === 'FAST' ? 'check-circle' : 'circle'}
          size={22}
          color={selected.id === 'FAST' ? colors.accent : colors.muted}
        />
      </Pressable>

      <Text style={styles.sectionTitle}>ALL LOCATIONS</Text>
      <View style={styles.list}>
        {filteredLocations.map((location) => (
          <LocationRow
            key={location.id}
            location={location}
            selected={selected.id === location.id}
            onPress={() => onSelect(location)}
          />
        ))}
        {filteredLocations.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="map-pin" size={24} color={colors.muted} />
            <Text style={styles.emptyTitle}>{loading ? 'Loading locations…' : locations.length === 0 ? 'No locations online' : 'No locations found'}</Text>
            <Text style={styles.emptyDetail}>{loading ? 'One moment.' : locations.length === 0 ? 'No server is running right now. Try again in a few minutes.' : 'Try another country or city.'}</Text>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <Button onPress={onBack}>Done</Button>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  searchBox: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 15,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 12,
  },
  fastestCard: {
    minHeight: 88,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingHorizontal: 13,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  fastestSelected: {
    borderColor: colors.accent,
    backgroundColor: '#10231D',
  },
  pressed: {
    opacity: 0.78,
  },
  fastestIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
  },
  fastestCopy: {
    flex: 1,
    gap: 4,
  },
  fastestTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  fastestDetail: {
    color: colors.secondary,
    fontSize: 13,
  },
  sectionTitle: {
    color: colors.secondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.4,
    marginTop: 4,
  },
  list: {
    gap: 10,
  },
  emptyState: {
    alignItems: 'center',
    gap: 9,
    paddingVertical: 42,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDetail: {
    color: colors.secondary,
    fontSize: 13,
  },
  footer: {
    paddingTop: 4,
  },
});
