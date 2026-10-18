import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {VisitPurposeEditor} from '@/components/VisitPurposeEditor';
const mocks=vi.hoisted(()=>({update:vi.fn(),single:vi.fn(),success:vi.fn(),error:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:()=>({update:mocks.update})}}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
beforeEach(()=>{
  vi.clearAllMocks();
  const chain={eq:()=>chain,in:()=>chain,select:()=>chain,single:mocks.single};
  mocks.update.mockReturnValue(chain);
  mocks.single.mockResolvedValue({data:{id:'visit-1'},error:null});
});
afterEach(cleanup);
function open(beforeSave=async()=>{}) {
  render(<QueryClientProvider client={new QueryClient()}><VisitPurposeEditor id="visit-1" purpose="Meeting" beforeSave={beforeSave}/></QueryClientProvider>);
  fireEvent.click(screen.getByRole('button',{name:'Edit purpose / remark'}));
}
it('updates only the purpose and prevents blank remarks',async()=>{
  open();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'   '}});
  expect(screen.getByRole('button',{name:'Save purpose'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox'),{target:{value:'  Product training at own showroom  '}});
  fireEvent.click(screen.getByRole('button',{name:'Save purpose'}));
  await waitFor(()=>expect(mocks.success).toHaveBeenCalledWith('Visit purpose updated'));
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({purpose:'Product training at own showroom'});
});
it('preserves the existing closed-day check and entered text',async()=>{
  open(async()=>{throw new Error('Day already ended');});
  fireEvent.click(screen.getByRole('button',{name:'Save purpose'}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith('Day already ended'));
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue('Meeting');
});
it('keeps the editor open if the visit was completed elsewhere or access changed',async()=>{
  mocks.single.mockResolvedValue({data:null,error:new Error('No row updated')});
  open();fireEvent.click(screen.getByRole('button',{name:'Save purpose'}));
  await waitFor(()=>expect(mocks.error).toHaveBeenCalledWith('No row updated'));
  expect(mocks.success).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox')).toHaveValue('Meeting');
});
