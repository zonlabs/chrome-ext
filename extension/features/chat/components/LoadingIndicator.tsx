export const LoadingIndicator: React.FC = () => {
  return (
    <div className="flex items-center gap-2 py-1">
      <div className="flex items-center gap-[3px] h-4">
        <span className="w-[3px] h-[14px] rounded-[2px] bg-[#e8574a] animate-[wave-eq_1.2s_ease-in-out_infinite]" />
        <span className="w-[3px] h-[14px] rounded-[2px] bg-[#e8574a] animate-[wave-eq_1.2s_ease-in-out_infinite_0.15s]" />
        <span className="w-[3px] h-[14px] rounded-[2px] bg-[#e8574a] animate-[wave-eq_1.2s_ease-in-out_infinite_0.3s]" />
        <span className="w-[3px] h-[14px] rounded-[2px] bg-[#e8574a] animate-[wave-eq_1.2s_ease-in-out_infinite_0.45s]" />
        <span className="w-[3px] h-[14px] rounded-[2px] bg-[#e8574a] animate-[wave-eq_1.2s_ease-in-out_infinite_0.6s]" />
      </div>
    </div>
  );
};
