import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import api from '../lib/api';

export default function StaticPage() {
  const { key } = useParams();
  const { t, i18n } = useTranslation();
  const locale = i18n.language?.startsWith('en') ? 'en' : 'ru';
  const { data, isError } = useQuery({
    queryKey: ['content', key, locale],
    queryFn: async () => (await api.get(`/content/${key}?locale=${locale}`)).data,
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="card p-8">
        {isError ? (
          <div className="text-white/40">{t('common.empty')}</div>
        ) : (
          <>
            <h1 className="mb-4 text-3xl font-extrabold holo-text">{data?.title ?? '…'}</h1>
            <div className="whitespace-pre-line leading-relaxed text-white/75">{data?.body}</div>
          </>
        )}
      </div>
    </div>
  );
}
