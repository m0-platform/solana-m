import { useState, useRef, useEffect } from 'react';
import { useAddressDirectory } from '../hooks/useAddressDirectory';

interface AddressDirectoryProps {
  onSelect: (address: string) => void;
  currentAddress: string;
  isOpen: boolean;
  onClose: () => void;
}

export const AddressDirectory: React.FC<AddressDirectoryProps> = ({ onSelect, currentAddress, isOpen, onClose }) => {
  const { addresses, saveAddress, removeAddress } = useAddressDirectory();
  const [newTag, setNewTag] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = (event: MouseEvent) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      onClose();
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      // Check if current address is new and needs to be added
      if (currentAddress && !addresses.some((a) => a.address === currentAddress)) {
        setShowAddForm(true);
      }
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, currentAddress, addresses]);

  const handleAddAddress = () => {
    if (currentAddress) {
      saveAddress({
        address: currentAddress,
        tag: newTag || 'Untitled',
      });
      setNewTag('');
      setShowAddForm(false);
    }
  };

  const handleDeleteAddress = (address: string) => {
    removeAddress(address);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-blur-sm flex items-center justify-center z-20">
      <div ref={modalRef} className="bg-gray-600 p-4 w-full max-w-lg text-white text-sm">
        <div className="flex justify-between mb-4">
          <h2 className="text-lg font-semibold">Address Directory</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            ✕
          </button>
        </div>

        {showAddForm || !addresses.length ? (
          <div className="mb-4">
            <h3 className="font-medium mb-2">{currentAddress ? 'Save this address?' : 'Add new address:'}</h3>
            <div className="mb-2 break-all bg-white text-black p-2">{currentAddress || 'No address selected'}</div>
            <div className="flex">
              <input
                type="text"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="Enter a name/tag for this address"
                className="flex-1 bg-white p-2 mr-2 focus:outline-none text-black"
              />
              <button onClick={() => setShowAddForm(false)} className="bg-gray-700 px-2 mr-2">
                Cancel
              </button>
              <button
                onClick={handleAddAddress}
                disabled={!currentAddress}
                className={`px-3 py-1 ${
                  !currentAddress ? 'bg-gray-600 text-gray-400' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddForm(true)}
            className="mb-4 bg-green-700 hover:bg-green-700 px-3 py-1 text-sm"
          >
            + Add New Address
          </button>
        )}

        {addresses.length > 0 && (
          <div className="max-h-80 overflow-y-auto">
            {addresses.map((entry) => (
              <div key={entry.address} className="mb-2 p-2 bg-gray-800">
                <div className="flex justify-between items-start">
                  <div
                    className="font-medium cursor-pointer hover:text-blue-300"
                    onClick={() => onSelect(entry.address)}
                  >
                    {entry.tag}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handleDeleteAddress(entry.address)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div
                  className="text-xs text-gray-400 break-all cursor-pointer hover:text-blue-300"
                  onClick={() => onSelect(entry.address)}
                >
                  {entry.address}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
