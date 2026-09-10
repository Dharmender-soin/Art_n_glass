import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WhatsHubReports } from '@/components/WhatsHubReports';
import { getReportSettings, saveReportSetting, sendReport } from '@/lib/whatshub';
vi.mock('@/lib/whatshub', () => ({getReportSettings:vi.fn(),saveReportSetting:vi.fn(),sendReport:vi.fn(),previewReport:vi.fn()}));
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getReportSettings).mockResolvedValue({reports:[{key:'daily_planning',enabled:false}]});
});
afterEach(cleanup);
function open() {
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><WhatsHubReports showroomId="gurgaon" /></QueryClientProvider>);
}
it('saves toggle and reloads server state, while allowing a test with schedule off',async () => {
  vi.mocked(sendReport).mockResolvedValue({sent:1,recipients:1});
  vi.mocked(saveReportSetting).mockImplementation(async () => {
    vi.mocked(getReportSettings).mockResolvedValue({reports:[{key:'daily_planning',enabled:true}]});
    return {saved:true};
  });
  open();
  await waitFor(() => expect(screen.getAllByRole('button',{name:'Send Test Report'})[0]).toBeEnabled());
  fireEvent.click(screen.getAllByRole('button',{name:'Send Test Report'})[0]);
  await waitFor(() => expect(sendReport).toHaveBeenCalledWith('gurgaon','daily_planning'));
  const toggle = screen.getByRole('switch',{name:'Daily Planned Visits auto-send'});
  expect(toggle).not.toBeChecked();
  fireEvent.click(toggle);
  await waitFor(() => expect(saveReportSetting).toHaveBeenCalledWith('gurgaon','daily_planning',true));
  await waitFor(() => expect(toggle).toBeChecked());
});
it('does not pretend failed saves succeeded',async () => {
  vi.mocked(saveReportSetting).mockRejectedValue(new Error('Save failed'));
  open();
  const toggle=screen.getByRole('switch',{name:'Daily Planned Visits auto-send'});
  await waitFor(() => expect(toggle).toBeEnabled());
  fireEvent.click(toggle);
  expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
  expect(toggle).not.toBeChecked();
});
