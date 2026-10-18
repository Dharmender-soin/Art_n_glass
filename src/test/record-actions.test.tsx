import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,it,expect,vi} from 'vitest';
import {RecordActions} from '@/components/RecordActions';
const mocks=vi.hoisted(()=>({rpc:vi.fn(),role:'manager',success:vi.fn(),error:vi.fn()}));
vi.mock('@/hooks/useAuth',()=>({useAuth:()=>({role:mocks.role})}));
vi.mock('@/hooks/useAssignableUsers',()=>({useAssignableUsers:()=>({data:[{user_id:'new-owner',full_name:'Mr. New Owner',role:'executive'}],isPending:false,isError:false})}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mocks.rpc}}));
vi.mock('sonner',()=>({toast:{success:mocks.success,error:mocks.error}}));
beforeEach(()=>{vi.clearAllMocks();Object.defineProperty(HTMLElement.prototype,'scrollIntoView',{configurable:true,value:vi.fn()});mocks.role='manager';mocks.rpc.mockResolvedValue({data:{transferred_count:2},error:null});});
afterEach(cleanup);
function open(){render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><RecordActions kind="partner" id="partner-id" name="Architect One" ownerId="old-owner" allowDelete/></QueryClientProvider>);}
it('sends an explicit target, reason and linked-client choice and confirms success',async()=>{
  open();fireEvent.click(screen.getByRole('button',{name:'Transfer partner'}));
  fireEvent.click(screen.getByRole('combobox',{name:'Receiving executive'}));
  fireEvent.click(await screen.findByRole('option',{name:'New Owner'}));
  expect(screen.getByRole('button',{name:'Confirm transfer'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Reason for record action'}),{target:{value:'New territory'}});
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button',{name:'Confirm transfer'}));
  await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledWith('manage_crm_record',{p_kind:'partner',p_id:'partner-id',p_action:'transfer',p_target:'new-owner',p_include_clients:true,p_reason:'New territory'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});
it('keeps the dialog and reason when the server blocks deletion of linked history',async()=>{
  mocks.rpc.mockResolvedValue({data:null,error:new Error('This partner has linked clients or visits')});
  open();fireEvent.click(screen.getByRole('button',{name:'Delete partner'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Reason for record action'}),{target:{value:'Duplicate'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm delete'}));
  expect(await screen.findByRole('alert')).toHaveTextContent('linked clients or visits');
  expect(screen.getByRole('textbox')).toHaveValue('Duplicate');
  expect(mocks.success).not.toHaveBeenCalled();
});
it('does not offer management transfers or deletes to an executive',()=>{
  mocks.role='executive';open();expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
