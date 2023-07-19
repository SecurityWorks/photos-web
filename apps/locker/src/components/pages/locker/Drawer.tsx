import SubscriptionCard from '@/components/Sidebar/SubscriptionCard';
import { DrawerSidebar } from '@/components/Sidebar/drawer';
import { LockerDashboardContext } from '@/pages/locker';
import {
    List,
    ListItem,
    IconButton,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    Box,
} from '@mui/material';
import { Dispatch, SetStateAction, useContext } from 'react';
import MenuIcon from '@mui/icons-material/Menu';
import CloudIcon from '@mui/icons-material/Cloud';
import FolderDeleteIcon from '@mui/icons-material/FolderDelete';
// import SettingsIcon from '@mui/icons-material/Settings';
import { t } from 'i18next';

const LockerDrawer = ({
    isOpen,
    setIsOpen,
}: {
    isOpen: boolean;
    setIsOpen: Dispatch<SetStateAction<boolean>>;
}) => {
    const { userDetails, setDashboardView } = useContext(
        LockerDashboardContext
    );

    return (
        <DrawerSidebar
            anchor="left"
            open={isOpen}
            onClose={() => {
                setIsOpen(false);
            }}>
            <List>
                <ListItem>
                    <IconButton
                        onClick={() => {
                            setIsOpen(false);
                        }}>
                        <MenuIcon />
                    </IconButton>
                </ListItem>
                <ListItem>
                    {userDetails && (
                        <Box px={0.5} mt={2} pb={1.5} mb={1}>
                            <SubscriptionCard
                                userDetails={userDetails}
                                onClick={() => {
                                    console.log('Hello!');
                                }}
                            />
                        </Box>
                    )}
                </ListItem>
                <ListItem>
                    <ListItemButton
                        onClick={() => {
                            setDashboardView('locker');
                            setIsOpen(false);
                        }}>
                        <ListItemIcon>
                            <CloudIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('LOCKER')} />
                    </ListItemButton>
                </ListItem>
                <ListItem>
                    <ListItemButton
                        onClick={() => {
                            setDashboardView('trash');
                            setIsOpen(false);
                        }}>
                        <ListItemIcon>
                            <FolderDeleteIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('TRASH')} />
                    </ListItemButton>
                </ListItem>
                {/* <ListItem>
                    <ListItemButton>
                        <ListItemIcon>
                            <SettingsIcon />
                        </ListItemIcon>
                        <ListItemText primary="Settings" />
                    </ListItemButton>
                </ListItem> */}
            </List>
        </DrawerSidebar>
    );
};

export default LockerDrawer;
