import { useQuery } from 'react-query';
import { getApiClient } from './network.js';
import { Select, Spinner } from '@inkjs/ui';

export type Token = {
  mint: string;
  name: string;
};

type TokenInputProps = {
  onChange?: (token: Token) => void;
  nonExtensionTokens?: Token[];
};

export default function TokenInput({ onChange, nonExtensionTokens }: TokenInputProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['extensions'],
    queryFn: () => getApiClient().extensions.extensions(),
  });

  if (isLoading) {
    return <Spinner label="Loading Extensions" />;
  }

  return (
    <Select
      options={[
        ...(nonExtensionTokens?.map((token) => ({
          label: token.name,
          value: JSON.stringify(token),
        })) ?? []),
        ...(data?.extensions?.map((ext) => ({
          label: ext.name,
          value: JSON.stringify(ext),
        })) || []),
      ]}
      onChange={(value) => onChange(JSON.parse(value))}
    />
  );
}
