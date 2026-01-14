using System.Windows;
using RepairCategories;

namespace RepairCategoriesApp
{
    public partial class MainWindow : Window
    {
        public MainWindow()
        {
            InitializeComponent();
        }

        private void Open_Click(object sender, RoutedEventArgs e)
        {
            var w = new RepairCategoriesWindow();
            w.ShowDialog();
        }
    }
}
