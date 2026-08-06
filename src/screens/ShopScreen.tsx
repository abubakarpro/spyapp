import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  StatusBar,
  Dimensions,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import axios from 'axios';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;

const API_BASE = 'https://clothstorebackend-production.up.railway.app/api';
const LIMIT = 50;

interface Product {
  id: string;
  name: string;
  price: number;
  discountPrice: number;
  discountPercentage: number;
  images: string[];
  category: { name: string };
  isNewArrival: boolean;
  isBestSeller: boolean;
  sizes: string[];
}

interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export const ShopScreen = () => {
  const insets = useSafeAreaInsets();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);

  const fetchProducts = useCallback(async (pageNum: number) => {
    try {
      pageNum === 1 ? setLoading(true) : setPageLoading(true);
      const res = await axios.get(
        `${API_BASE}/products?sort=newest&page=${pageNum}&limit=${LIMIT}`,
      );
      const data = res.data;
      setProducts(data.items || []);
      setMeta(data.meta || null);
    } catch (err) {
      console.error('Failed to fetch products:', err);
    } finally {
      setLoading(false);
      setPageLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts(page);
  }, [page]);

  const goToPage = (newPage: number) => {
    if (newPage < 1 || (meta && newPage > meta.totalPages)) return;
    setPage(newPage);
  };

  const renderProduct = ({ item }: { item: Product }) => {
    const hasDiscount = item.discountPrice && item.discountPrice < item.price;
    return (
      <View style={styles.card}>
        <View style={styles.imageContainer}>
          <Image
            source={{ uri: item.images[0] }}
            style={styles.productImage}
            resizeMode="cover"
          />
          {item.isNewArrival && (
            <View style={styles.badgeNew}>
              <Text style={styles.badgeText}>NEW</Text>
            </View>
          )}
          {hasDiscount && item.discountPercentage > 0 && (
            <View style={styles.badgeDiscount}>
              <Text style={styles.badgeText}>{item.discountPercentage}% OFF</Text>
            </View>
          )}
        </View>

        <View style={styles.cardBody}>
          <Text style={styles.categoryText} numberOfLines={1}>
            {item.category?.name || 'Collection'}
          </Text>
          <Text style={styles.productName} numberOfLines={2}>
            {item.name}
          </Text>

          <View style={styles.priceRow}>
            {hasDiscount ? (
              <>
                <Text style={styles.discountPrice}>
                  Rs. {item.discountPrice.toLocaleString()}
                </Text>
                <Text style={styles.originalPrice}>
                  Rs. {item.price.toLocaleString()}
                </Text>
              </>
            ) : (
              <Text style={styles.discountPrice}>
                Rs. {item.price.toLocaleString()}
              </Text>
            )}
          </View>

          {item.sizes && item.sizes.length > 0 && (
            <Text style={styles.sizesText}>{item.sizes.join(' · ')}</Text>
          )}
        </View>
      </View>
    );
  };

  const renderHeader = () => (
    <View style={styles.headerBanner}>
      <Text style={styles.headerTitle}>SCH Clothes House</Text>
      <Text style={styles.headerSubtitle}>Premium Pakistani Fashion</Text>
      {meta && (
        <Text style={styles.headerCount}>{meta.totalItems} Collections</Text>
      )}
    </View>
  );

  const renderPagination = () => {
    if (!meta || meta.totalPages <= 1) return null;

    const pages = [];
    const start = Math.max(1, page - 2);
    const end = Math.min(meta.totalPages, page + 2);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    return (
      <View style={styles.pagination}>
        <TouchableOpacity
          style={[styles.pageBtn, !meta.hasPrevPage && styles.pageBtnDisabled]}
          onPress={() => goToPage(page - 1)}
          disabled={!meta.hasPrevPage}>
          <Text style={styles.pageBtnText}>‹</Text>
        </TouchableOpacity>

        {start > 1 && (
          <>
            <TouchableOpacity style={styles.pageBtn} onPress={() => goToPage(1)}>
              <Text style={styles.pageBtnText}>1</Text>
            </TouchableOpacity>
            {start > 2 && <Text style={styles.pageDots}>…</Text>}
          </>
        )}

        {pages.map(p => (
          <TouchableOpacity
            key={p}
            style={[styles.pageBtn, p === page && styles.pageBtnActive]}
            onPress={() => goToPage(p)}>
            <Text style={[styles.pageBtnText, p === page && styles.pageBtnTextActive]}>
              {p}
            </Text>
          </TouchableOpacity>
        ))}

        {end < meta.totalPages && (
          <>
            {end < meta.totalPages - 1 && <Text style={styles.pageDots}>…</Text>}
            <TouchableOpacity
              style={styles.pageBtn}
              onPress={() => goToPage(meta.totalPages)}>
              <Text style={styles.pageBtnText}>{meta.totalPages}</Text>
            </TouchableOpacity>
          </>
        )}

        <TouchableOpacity
          style={[styles.pageBtn, !meta.hasNextPage && styles.pageBtnDisabled]}
          onPress={() => goToPage(page + 1)}
          disabled={!meta.hasNextPage}>
          <Text style={styles.pageBtnText}>›</Text>
        </TouchableOpacity>
      </View>
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <StatusBar barStyle="light-content" backgroundColor="#0f1b2d" translucent />
        <View style={styles.loaderContainer}>
          <Text style={styles.logoText}>SCH</Text>
          <Text style={styles.logoSub}>CLOTHES HOUSE</Text>
          <ActivityIndicator size="large" color="#c9a84c" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Loading Collections…</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0f1b2d" translucent />

      {/* Top navbar */}
      <View style={styles.navbar}>
        <Text style={styles.navLogo}>SCH</Text>
        <Text style={styles.navTitle}>Clothes House</Text>
        {meta && (
          <Text style={styles.navPage}>
            Pg {page}/{meta.totalPages}
          </Text>
        )}
      </View>

      {pageLoading && (
        <View style={styles.pageLoadingBar}>
          <ActivityIndicator size="small" color="#c9a84c" />
          <Text style={styles.pageLoadingText}>Loading page {page}…</Text>
        </View>
      )}

      <FlatList
        data={products}
        keyExtractor={item => item.id}
        renderItem={renderProduct}
        numColumns={2}
        columnWrapperStyle={styles.row}
        ListHeaderComponent={renderHeader}
        ListFooterComponent={renderPagination}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f1b2d',
  },

  // ── Navbar ────────────────────────────────────────────────
  navbar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0f1b2d',
    borderBottomWidth: 1,
    borderBottomColor: '#c9a84c33',
  },
  navLogo: {
    fontSize: 20,
    fontWeight: '900',
    color: '#c9a84c',
    letterSpacing: 3,
    marginRight: 8,
  },
  navTitle: {
    flex: 1,
    fontSize: 13,
    color: '#c9a84c99',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  navPage: {
    fontSize: 11,
    color: '#c9a84c88',
  },

  // ── Loader ────────────────────────────────────────────────
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0f1b2d',
  },
  logoText: {
    fontSize: 56,
    fontWeight: '900',
    color: '#c9a84c',
    letterSpacing: 8,
  },
  logoSub: {
    fontSize: 13,
    color: '#c9a84c88',
    letterSpacing: 4,
    marginTop: 4,
  },
  loadingText: {
    color: '#c9a84c66',
    marginTop: 12,
    fontSize: 13,
  },

  // ── Header banner ─────────────────────────────────────────
  headerBanner: {
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#c9a84c22',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#c9a84c',
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#8899aa',
    letterSpacing: 3,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  headerCount: {
    fontSize: 11,
    color: '#c9a84c66',
    marginTop: 6,
    letterSpacing: 1,
  },

  // ── List ──────────────────────────────────────────────────
  listContent: {
    paddingBottom: 24,
  },
  row: {
    paddingHorizontal: 12,
    justifyContent: 'space-between',
    marginBottom: 0,
  },

  // ── Product card ──────────────────────────────────────────
  card: {
    width: CARD_WIDTH,
    backgroundColor: '#16243a',
    borderRadius: 12,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#c9a84c22',
  },
  imageContainer: {
    position: 'relative',
  },
  productImage: {
    width: '100%',
    height: CARD_WIDTH * 1.2,
    backgroundColor: '#1e2d40',
  },
  badgeNew: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#c9a84c',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeDiscount: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#c0392b',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 10,
  },
  categoryText: {
    fontSize: 9,
    color: '#c9a84c88',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  productName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#dce8f5',
    lineHeight: 16,
    marginBottom: 8,
    minHeight: 32,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  discountPrice: {
    fontSize: 13,
    fontWeight: '800',
    color: '#c9a84c',
  },
  originalPrice: {
    fontSize: 11,
    color: '#667788',
    textDecorationLine: 'line-through',
  },
  sizesText: {
    fontSize: 9,
    color: '#8899aa',
    marginTop: 6,
    letterSpacing: 0.5,
  },

  // ── Page loading bar ──────────────────────────────────────
  pageLoadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: '#0f1b2d',
    gap: 8,
  },
  pageLoadingText: {
    color: '#c9a84c88',
    fontSize: 12,
  },

  // ── Pagination ────────────────────────────────────────────
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 12,
    flexWrap: 'wrap',
    gap: 6,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c9a84c44',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#16243a',
  },
  pageBtnActive: {
    backgroundColor: '#c9a84c',
    borderColor: '#c9a84c',
  },
  pageBtnDisabled: {
    opacity: 0.3,
  },
  pageBtnText: {
    color: '#c9a84c',
    fontSize: 14,
    fontWeight: '600',
  },
  pageBtnTextActive: {
    color: '#0f1b2d',
    fontWeight: '800',
  },
  pageDots: {
    color: '#c9a84c66',
    fontSize: 16,
    marginHorizontal: 2,
  },
});
