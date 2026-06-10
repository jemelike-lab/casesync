import CaseSyncV2MantineProvider from '@/components/casesync-v2/CaseSyncV2MantineProvider';

// Per-route layout for the v2 dashboard. Wraps with the v2 Mantine provider
// (which forces light mode + applies casesyncV2Theme) and paints the soft
// lavender canvas behind everything. Does NOT touch the root layout or
// globals.css — completely isolated to this route subtree.

export default function DashboardV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CaseSyncV2MantineProvider>
      <div
        style={{
          minHeight: '100dvh',
          background:
            'linear-gradient(160deg, #EEF2FC 0%, #F4ECFB 60%, #EDE9FB 100%)',
        }}
      >
        {children}
      </div>
    </CaseSyncV2MantineProvider>
  );
}
