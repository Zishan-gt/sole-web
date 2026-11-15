import React from 'react';
import { ReelsViewer } from '../components/ReelsViewer';
import { usePathname } from '../components/RouterLink';

export const ReelsPage: React.FC = () => {
  const { search } = usePathname();
  const params = new URLSearchParams(search);
  const initialPostId = params.get('post') || undefined;

  return (
    <div className="w-full h-full">
      <ReelsViewer mode="page" initialPostId={initialPostId} />
    </div>
  );
};
