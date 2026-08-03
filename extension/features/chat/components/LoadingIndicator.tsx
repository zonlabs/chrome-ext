import '../../../assets/shell.css';

export const LoadingIndicator: React.FC = () => {
  return (
    <div className="loading-indicator">
      <div className="loading-wave">
        <span className="loading-bar" />
        <span className="loading-bar" />
        <span className="loading-bar" />
        <span className="loading-bar" />
        <span className="loading-bar" />
      </div>
    </div>
  );
};
