import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/ThemedText';

interface Props {
  onCustomerPress: (customer: any) => void;
  onCreateCustomer: () => void;
}

export const DesktopCustomersLayout: React.FC<Props> = () => {
  return (
    <View style={styles.container}>
      <ThemedText style={styles.text}>Desktop layout not supported</ThemedText>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 16,
    color: '#6b7280',
  },
});
