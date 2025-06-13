import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, Alert, Dimensions, Platform } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DesktopLayout } from '@/components/layouts/DesktopLayout';
import { MobileWebLayout } from '@/components/layouts/MobileWebLayout';
import { MobileNativeLayout } from '@/components/layouts/MobileNativeLayout';

interface MenuItem {
  id: number;
  title: string;
  description: string;
  icon: string;
  section: string;
  color: string;
}

export default function HomeScreen() {
  const { logout, user } = useAuth();
  const router = useRouter();
  const [screenData, setScreenData] = useState(Dimensions.get('window'));
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const params = useLocalSearchParams();

  // Handle section parameter from menu navigation and URL
  useEffect(() => {
    if (params.section && typeof params.section === 'string') {
      setActiveSection(params.section);
    } else if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Check URL parameters for web only
      const urlParams = new URLSearchParams(window.location.search);
      const sectionFromUrl = urlParams.get('section');
      if (sectionFromUrl) {
        setActiveSection(sectionFromUrl);
      } else {
        setActiveSection(null);
      }
    } else {
      // For React Native, just reset to null if no section param
      setActiveSection(null);
    }
  }, [params.section]);

  // Listen for browser back/forward navigation (web only)
  useEffect(() => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const handlePopState = () => {
        const urlParams = new URLSearchParams(window.location.search);
        const sectionFromUrl = urlParams.get('section');
        setActiveSection(sectionFromUrl);
      };

      window.addEventListener('popstate', handlePopState);
      return () => window.removeEventListener('popstate', handlePopState);
    }
  }, []);

  useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };
    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Platform detection
  const isWeb = Platform.OS === 'web';
  const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
  const isMobileWeb = isWeb && screenData.width < 768;
  const isDesktop = isWeb && screenData.width >= 768;

  const handleLogout = () => {
    console.log('Logout button pressed');
    logout().catch(error => {
      console.error('Logout failed:', error);
    });
  };

  const handleSectionPress = (section: string) => {
    if (section === 'home') {
      // Reset to home state immediately
      setActiveSection(null);
      // Update URL to remove section parameter (web only)
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('section');
        window.history.replaceState({}, '', url.toString());
      }
      return;
    }

    // Immediately update state for faster UI response
    setActiveSection(section);

    // Update URL with section parameter for web only
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('section', section);
      window.history.pushState({}, '', url.toString());
    }
  };

  // Memoize menu items to prevent recreation on every render
  const menuItems = useMemo(() => [
    {
      id: 1,
      title: "Customers",
      description: "Manage customer information and relationships",
      icon: "👥",
      section: "customers",
      color: "#5469D4"
    },
    {
      id: 2,
      title: "Customer Orders",
      description: "Track and manage customer orders",
      icon: "📋",
      section: "customer_orders",
      color: "#5469D4"
    },
    {
      id: 3,
      title: "Vendors",
      description: "Manage vendor relationships and information",
      icon: "🏪",
      section: "vendors",
      color: "#5469D4"
    },
    {
      id: 4,
      title: "Purchase Orders",
      description: "Create and track purchase orders",
      icon: "🛒",
      section: "purchase_orders",
      color: "#5469D4"
    },
    {
      id: 5,
      title: "Payments",
      description: "Track incoming payments and receipts",
      icon: "💰",
      section: "payments",
      color: "#5469D4"
    },
    {
      id: 6,
      title: "Financial Accounts",
      description: "Manage company financial accounts and balances",
      icon: "💰",
      section: "financial-accounts",
      color: "#5469D4"
    },
    {
      id: 7,
      title: "Payouts",
      description: "Manage outgoing payments and expenses",
      icon: "💸",
      section: "payouts",
      color: "#5469D4"
    },
    {
      id: 8,
      title: "Expenses",
      description: "Track business expenses and costs",
      icon: "📊",
      section: "expenses",
      color: "#5469D4"
    },
    {
      id: 9,
      title: "Fixed Assets",
      description: "Manage company assets and equipment",
      icon: "🏭",
      section: "fixed_assets",
      color: "#5469D4"
    },
    {
      id: 10,
      title: "Vehicles",
      description: "Track company vehicles and fleet",
      icon: "🚛",
      section: "vehicles",
      color: "#5469D4"
    },
    {
      id: 11,
      title: "Employees",
      description: "Manage employee information and records",
      icon: "👨‍💼",
      section: "employees",
      color: "#5469D4"
    },
    {
      id: 12,
      title: "Users",
      description: "Manage users and permissions",
      icon: "👤",
      section: "users",
      color: "#5469D4"
    }
  ], []);

  // Memoize callbacks to prevent unnecessary re-renders
  const handleSectionPressMemoized = useCallback((section: string) => {
    if (section === 'home') {
      setActiveSection(null);
    } else {
      setActiveSection(section);
    }
  }, []);

  const handleBackToHomeMemoized = useCallback(() => {
    setActiveSection(null);
  }, []);

  // Render appropriate layout based on platform
  if (isDesktop) {
    return (
      <DesktopLayout
        menuItems={menuItems}
        activeSection={activeSection}
        user={user}
        onMenuPress={handleSectionPress}
        onLogoPress={handleBackToHomeMemoized}
        onLogout={handleLogout}
      />
    );
  }

  if (isMobileWeb) {
    return (
      <MobileWebLayout
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionPress={handleSectionPress}
        onBackToHome={handleBackToHomeMemoized}
      />
    );
  }

  if (isNative) {
    return (
      <MobileNativeLayout
        menuItems={menuItems}
        activeSection={activeSection}
        onSectionPress={handleSectionPress}
        onBackToHome={handleBackToHomeMemoized}
        onLogout={handleLogout}
      />
    );
  }

  // Fallback (should never reach here)
  return null;
}

const styles = StyleSheet.create({
  // This file now only contains the main component logic
  // All styles have been moved to their respective components
});