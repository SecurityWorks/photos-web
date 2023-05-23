import { runningInBrowser } from '@/utils/running';
import localForage from 'localforage';

if (runningInBrowser()) {
    localForage.config({
        name: 'ente-files',
        version: 1.0,
        storeName: 'files',
    });
}
export default localForage;
