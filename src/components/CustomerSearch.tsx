import React from 'react';

interface Props {
  onOpen?: () => void;
}

const CustomerSearch: React.FC<Props> = ({ onOpen }) => {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full bg-[#39FF14] text-black px-4 py-3 rounded font-bold text-sm shadow hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#39FF14]/60"
    >
      Customer Search
    </button>
  );
};

export default CustomerSearch;
