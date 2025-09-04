import { useState, useEffect } from 'react';

export type AddressEntry = {
  address: string;
  tag: string;
};

const LOCAL_STORAGE_KEY = 'address-directory';

export const useAddressDirectory = () => {
  const [addresses, setAddresses] = useState<AddressEntry[]>([]);

  useEffect(() => {
    // Load addresses from localStorage on component mount
    const storedAddresses = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (storedAddresses) {
      try {
        setAddresses(JSON.parse(storedAddresses));
      } catch (e) {
        console.error('Failed to parse stored addresses', e);
      }
    }
  }, []);

  const saveAddress = (entry: AddressEntry) => {
    const newAddresses = [...addresses];
    const existingIndex = newAddresses.findIndex((a) => a.address === entry.address);

    if (existingIndex >= 0) {
      // Update existing entry
      newAddresses[existingIndex] = entry;
    } else {
      // Add new entry
      newAddresses.push(entry);
    }

    setAddresses(newAddresses);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newAddresses));
    return newAddresses;
  };

  const removeAddress = (address: string) => {
    const newAddresses = addresses.filter((a) => a.address !== address);
    setAddresses(newAddresses);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newAddresses));
    return newAddresses;
  };

  const getAddressEntry = (address: string): AddressEntry | undefined => {
    return addresses.find((a) => a.address === address);
  };

  return { addresses, saveAddress, removeAddress, getAddressEntry };
};
